import { DataSource } from 'typeorm';
import {
  Candidate,
  CandidateDecision,
} from './../src/candidates/candidate.entity.js';
import { Evaluation } from './../src/candidates/evaluation.entity.js';
import { CandidateFlag } from './../src/candidates/evaluation.types.js';
import { ScoringConfigVersion } from './../src/jobs/scoring-config-version.entity.js';
import {
  ScreeningModelUnavailableError,
  UnreadableFileError,
} from './../src/processing/processing-errors.js';
import {
  ResumeProcessor,
  RetryLaterError,
} from './../src/processing/resume-processor.service.js';
import { ResumeSweeper } from './../src/processing/resume-sweeper.service.js';
import { Resume, ResumeStatus } from './../src/resumes/resume.entity.js';
import { FakeStages, fakeResume } from './fake-stages.js';
import { bearer, createHarness, hasDatabase, type Harness } from './harness.js';

describe.skipIf(!hasDatabase)('Resume processing (e2e)', () => {
  const stages = new FakeStages();
  let h: Harness;
  let token: string;
  let db: DataSource;
  let processor: ResumeProcessor;
  const firstTry = { attemptsMade: 0, maxAttempts: 3 };
  const lastTry = { attemptsMade: 2, maxAttempts: 3 };

  beforeAll(async () => {
    h = await createHarness({ customize: (b) => stages.override(b) });
    token = await h.signIn('processing');
    db = h.app.get(DataSource);
    processor = h.app.get(ResumeProcessor);
  });

  afterAll(async () => {
    await h?.app.close();
  });

  const createJob = async (minMatchScore = 0) =>
    (
      await h
        .http()
        .post('/api/v1/jobs')
        .set(bearer(token))
        .send({
          title: 'Backend Engineer',
          description: 'APIs',
          requiredSkills: ['TypeScript', 'PostgreSQL'],
          preferredSkills: ['Docker'],
          minExperienceYears: 3,
          minMatchScore,
        })
        .expect(201)
    ).body as { id: string };

  /** Uploads one resume and returns its queued task. */
  const uploadResume = async (jobId: string, content: Buffer) => {
    const response = await h
      .http()
      .post(`/api/v1/jobs/${jobId}/resumes`)
      .set(bearer(token))
      .attach('files', content, 'cv.pdf')
      .expect(202);
    const resumeId = response.body.results[0].resumeId as string;
    const task = h.queue.tasks.find((t) => t.resumeId === resumeId);
    expect(task).toBeDefined();
    return task!;
  };

  const resumeRow = (id: string) =>
    db.getRepository(Resume).findOneByOrFail({ id });

  it('processes a resume into a candidate with a traceable evaluation', async () => {
    const job = await createJob(50);
    const task = await uploadResume(
      job.id,
      fakeResume('Jane Doe', 'TypeScript, PostgreSQL and Docker. years: 5'),
    );

    expect(await processor.process(task, firstTry)).toBe('processed');

    const resume = await resumeRow(task.resumeId);
    expect(resume).toMatchObject({
      status: ResumeStatus.Processed,
      attempts: 1,
      lastError: null,
    });
    const candidate = await db
      .getRepository(Candidate)
      .findOneByOrFail({ resumeId: task.resumeId });
    expect(candidate).toMatchObject({
      jobId: job.id,
      fullName: 'Jane Doe',
      email: 'candidate@example.com',
      decision: CandidateDecision.Pending,
      matchScore: 90,
      experienceYears: 5,
      skills: ['TypeScript', 'PostgreSQL', 'Docker'],
      skillsNormalized: ['typescript', 'postgresql', 'docker'],
      missingSkills: [],
      flags: [],
      belowThreshold: false,
    });
    const evaluation = await db
      .getRepository(Evaluation)
      .findOneByOrFail({ id: candidate.latestEvaluationId ?? '' });
    const config = await db
      .getRepository(ScoringConfigVersion)
      .findOneByOrFail({ id: evaluation.configVersionId });
    expect(config).toMatchObject({ jobId: job.id, version: 1 });
    expect(evaluation).toMatchObject({
      modelName: 'fake-model',
      modelVersion: '1.0',
      matchScore: 90,
    });
    expect(evaluation.contributions).toHaveLength(4);

    // Contacts never reach the model.
    const sent = stages.modelCalls.at(-1)!;
    expect(sent.resumeText).not.toContain('Jane Doe');
  });

  it('flags missing mandatory skills, low scores and manipulation', async () => {
    const job = await createJob(80);
    stages.manipulation = true;
    const task = await uploadResume(
      job.id,
      fakeResume('John Roe', 'Docker only. years: 1'),
    );

    await processor.process(task, firstTry);
    stages.manipulation = false;

    const candidate = await db
      .getRepository(Candidate)
      .findOneByOrFail({ resumeId: task.resumeId });
    expect(candidate.belowThreshold).toBe(true);
    expect(candidate.missingSkills).toEqual(['TypeScript', 'PostgreSQL']);
    expect(candidate.flags).toEqual([
      CandidateFlag.DoesNotMeetRequirements,
      CandidateFlag.PossibleManipulation,
    ]);
  });

  it('re-scores with the new requirements and keeps the decision', async () => {
    const job = await createJob();
    const task = await uploadResume(
      job.id,
      fakeResume('Ann Lee', 'TypeScript PostgreSQL years: 4'),
    );
    await processor.process(task, firstTry);
    const candidates = db.getRepository(Candidate);
    const before = await candidates.findOneByOrFail({
      resumeId: task.resumeId,
    });
    await candidates.update(before.id, {
      decision: CandidateDecision.Approved,
    });

    await h
      .http()
      .patch(`/api/v1/jobs/${job.id}`)
      .set(bearer(token))
      .send({ requiredSkills: ['TypeScript', 'PostgreSQL', 'Kotlin'] })
      .expect(200);
    const rescore = await h
      .http()
      .post(`/api/v1/jobs/${job.id}/rescore`)
      .set(bearer(token))
      .expect(202);
    expect(rescore.body.queued).toBe(1);
    expect((await resumeRow(task.resumeId)).status).toBe(ResumeStatus.Queued);

    const rescoreTask = h.queue.tasks.at(-1)!;
    expect(rescoreTask.resumeId).toBe(task.resumeId);
    expect(rescoreTask.configVersionId).not.toBe(task.configVersionId);
    await processor.process(rescoreTask, firstTry);

    const after = await candidates.findOneByOrFail({ resumeId: task.resumeId });
    expect(after.id).toBe(before.id);
    expect(after.decision).toBe(CandidateDecision.Approved);
    expect(after.missingSkills).toEqual(['Kotlin', 'Docker']);
    expect(after.latestEvaluationId).not.toBe(before.latestEvaluationId);
    expect(
      await db.getRepository(Evaluation).countBy({ candidateId: after.id }),
    ).toBe(2);
  });

  it('retries temporary failures, then marks the resume failed', async () => {
    const job = await createJob();
    const task = await uploadResume(
      job.id,
      fakeResume('Temp Fail', 'TypeScript'),
    );
    stages.errors.model.push(
      new ScreeningModelUnavailableError(),
      new ScreeningModelUnavailableError(),
    );

    await expect(processor.process(task, firstTry)).rejects.toBeInstanceOf(
      RetryLaterError,
    );
    expect(await resumeRow(task.resumeId)).toMatchObject({
      status: ResumeStatus.Queued,
      lastError:
        'The screening service is temporarily unavailable. Processing will be retried.',
    });

    expect(await processor.process(task, lastTry)).toBe('failed');
    expect(await resumeRow(task.resumeId)).toMatchObject({
      status: ResumeStatus.ProcessingFailed,
      attempts: 2,
      lastErrorRetryable: true,
      lastError:
        'The screening service is temporarily unavailable. Retry processing later.',
    });

    // A recruiter can retry it.
    const retried = await h
      .http()
      .post(`/api/v1/resumes/${task.resumeId}/retry`)
      .set(bearer(token))
      .expect(202);
    expect(retried.body).toMatchObject({ status: 'Queued', lastError: null });
    expect(await processor.process(h.queue.tasks.at(-1)!, firstTry)).toBe(
      'processed',
    );
  });

  it('marks unreadable files and refuses to retry them', async () => {
    const job = await createJob();
    const task = await uploadResume(job.id, fakeResume('Scan', '...'));
    stages.errors.extract.push(new UnreadableFileError());

    expect(await processor.process(task, firstTry)).toBe('unreadable');
    expect(await resumeRow(task.resumeId)).toMatchObject({
      status: ResumeStatus.CouldNotReadFile,
      lastErrorRetryable: false,
    });
    const response = await h
      .http()
      .post(`/api/v1/resumes/${task.resumeId}/retry`)
      .set(bearer(token))
      .expect(409);
    expect(response.body.message).toMatch(/could not be read/);
  });

  it('fails without retrying when the model result is incomplete', async () => {
    const job = await createJob();
    const task = await uploadResume(
      job.id,
      fakeResume('Bad Model', 'TypeScript'),
    );
    stages.nextModelResult = {
      modelName: 'fake-model',
      modelVersion: '1.0',
      skills: [],
      experienceYears: null,
      verdicts: [],
    };

    expect(await processor.process(task, firstTry)).toBe('failed');
    expect(await resumeRow(task.resumeId)).toMatchObject({
      status: ResumeStatus.ProcessingFailed,
      lastErrorRetryable: false,
      lastError:
        'The screening service returned an incomplete result for this resume.',
    });

    const retried = await h
      .http()
      .post(`/api/v1/jobs/${job.id}/resumes/retry-failed`)
      .set(bearer(token))
      .expect(202);
    expect(retried.body.queued).toBe(1);
  });

  it('skips a task whose resume is already processed or gone', async () => {
    const job = await createJob();
    const task = await uploadResume(job.id, fakeResume('Twice', 'TypeScript'));
    await processor.process(task, firstTry);
    expect(await processor.process(task, firstTry)).toBe('skipped');

    expect(
      await processor.process(
        {
          resumeId: '00000000-0000-0000-0000-000000000000',
          configVersionId: 'x',
        },
        firstTry,
      ),
    ).toBe('skipped');
  });

  it('fails resumes of a deleted job', async () => {
    const job = await createJob();
    const task = await uploadResume(job.id, fakeResume('Orphan', 'TypeScript'));
    await h
      .http()
      .delete(`/api/v1/jobs/${job.id}`)
      .set(bearer(token))
      .expect(204);

    expect(await processor.process(task, firstTry)).toBe('failed');
    expect((await resumeRow(task.resumeId)).lastError).toBe(
      'The job for this resume was deleted.',
    );
  });

  describe('sweeper', () => {
    const hoursAgo = (hours: number) =>
      new Date(Date.now() - hours * 3_600_000);

    it('queues stuck resumes again and retries temporary failures', async () => {
      const job = await createJob();
      const stuck = await uploadResume(job.id, fakeResume('Stuck', 'a'));
      const crashed = await uploadResume(job.id, fakeResume('Crashed', 'b'));
      const temporary = await uploadResume(
        job.id,
        fakeResume('Temporary', 'c'),
      );
      const permanent = await uploadResume(
        job.id,
        fakeResume('Permanent', 'd'),
      );
      const recent = await uploadResume(job.id, fakeResume('Recent', 'e'));
      const resumes = db.getRepository(Resume);
      await resumes.update(stuck.resumeId, { queuedAt: hoursAgo(1) });
      await resumes.update(crashed.resumeId, {
        status: ResumeStatus.Processing,
        processingStartedAt: hoursAgo(1),
      });
      await resumes.update(temporary.resumeId, {
        status: ResumeStatus.ProcessingFailed,
        lastErrorRetryable: true,
        processedAt: hoursAgo(2),
      });
      await resumes.update(permanent.resumeId, {
        status: ResumeStatus.ProcessingFailed,
        lastErrorRetryable: false,
        processedAt: hoursAgo(2),
      });

      const queuedBefore = h.queue.tasks.length;
      await h.app.get(ResumeSweeper).sweep();
      const swept = h.queue.tasks.slice(queuedBefore).map((t) => t.resumeId);

      expect(swept).toEqual(
        expect.arrayContaining([
          stuck.resumeId,
          crashed.resumeId,
          temporary.resumeId,
        ]),
      );
      expect(swept).not.toContain(permanent.resumeId);
      expect(swept).not.toContain(recent.resumeId);
      expect(await resumeRow(crashed.resumeId)).toMatchObject({
        status: ResumeStatus.Queued,
      });
      expect(await resumeRow(temporary.resumeId)).toMatchObject({
        status: ResumeStatus.Queued,
        autoRetryCount: 1,
      });
    });

    it('stops retrying a failure after the limit', async () => {
      const job = await createJob();
      const task = await uploadResume(job.id, fakeResume('Limit', 'a'));
      await db.getRepository(Resume).update(task.resumeId, {
        status: ResumeStatus.ProcessingFailed,
        lastErrorRetryable: true,
        processedAt: hoursAgo(2),
        autoRetryCount: 3,
      });

      const queuedBefore = h.queue.tasks.length;
      await h.app.get(ResumeSweeper).sweep();
      const swept = h.queue.tasks.slice(queuedBefore).map((t) => t.resumeId);
      expect(swept).not.toContain(task.resumeId);
    });

    it('ignores resumes of deleted jobs', async () => {
      const job = await createJob();
      const task = await uploadResume(job.id, fakeResume('Gone', 'a'));
      await db
        .getRepository(Resume)
        .update(task.resumeId, { queuedAt: hoursAgo(1) });
      await h
        .http()
        .delete(`/api/v1/jobs/${job.id}`)
        .set(bearer(token))
        .expect(204);

      const queuedBefore = h.queue.tasks.length;
      await h.app.get(ResumeSweeper).sweep();
      const swept = h.queue.tasks.slice(queuedBefore).map((t) => t.resumeId);
      expect(swept).not.toContain(task.resumeId);
    });
  });

  it("forbids retrying another company's resume", async () => {
    const job = await createJob();
    const task = await uploadResume(job.id, fakeResume('Private', 'a'));
    const stranger = await h.signIn('stranger');
    await h
      .http()
      .post(`/api/v1/resumes/${task.resumeId}/retry`)
      .set(bearer(stranger))
      .expect(403);
    await h
      .http()
      .post(`/api/v1/jobs/${job.id}/rescore`)
      .set(bearer(stranger))
      .expect(403);
  });
});
