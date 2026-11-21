import { getQueueToken } from '@nestjs/bullmq';
import type { Queue } from 'bullmq';
import { DataSource } from 'typeorm';
import { Candidate } from './../src/candidates/candidate.entity.js';
import { ScreeningModelUnavailableError } from './../src/processing/processing-errors.js';
import { ResumeWorker } from './../src/processing/resume-worker.service.js';
import { RESUME_QUEUE } from './../src/queue/processing-queue.js';
import { Resume, ResumeStatus } from './../src/resumes/resume.entity.js';
import { FakeStages, fakeResume } from './fake-stages.js';
import { bearer, createHarness, hasDatabase, type Harness } from './harness.js';

// Uses the real BullMQ queue and workers on Valkey/Redis (REDIS_URL).
describe.skipIf(!hasDatabase)('Background worker with BullMQ (e2e)', () => {
  const stages = new FakeStages();
  let h: Harness;
  let token: string;
  let db: DataSource;

  beforeAll(async () => {
    h = await createHarness({
      realQueue: true,
      customize: (b) => stages.override(b),
    });
    // Start from an empty queue in the test database.
    await h.app
      .get<Queue>(getQueueToken(RESUME_QUEUE))
      .obliterate({ force: true });
    await h.app.get(ResumeWorker).start();
    token = await h.signIn('worker');
    db = h.app.get(DataSource);
  });

  afterAll(async () => {
    await h?.app.close();
  });

  async function waitForStatus(
    resumeId: string,
    status: ResumeStatus,
    timeoutMs = 15_000,
  ): Promise<Resume> {
    const started = Date.now();
    for (;;) {
      const resume = await db
        .getRepository(Resume)
        .findOneByOrFail({ id: resumeId });
      if (resume.status === status) {
        return resume;
      }
      if (Date.now() - started > timeoutMs) {
        throw new Error(
          `Resume ${resumeId} is "${resume.status}" (${resume.lastError ?? 'no error'}), expected "${status}"`,
        );
      }
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
  }

  it('processes uploaded resumes in the background, retrying temporary failures', async () => {
    const job = await h
      .http()
      .post('/api/v1/jobs')
      .set(bearer(token))
      .send({
        title: 'Data Engineer',
        description: 'Pipelines',
        requiredSkills: ['Python'],
        minExperienceYears: 1,
      })
      .expect(201);
    // The first model call fails; BullMQ retries after the backoff.
    stages.errors.model.push(new ScreeningModelUnavailableError());

    const upload = await h
      .http()
      .post(`/api/v1/jobs/${job.body.id}/resumes`)
      .set(bearer(token))
      .attach('files', fakeResume('Ada', 'Python years: 3'), 'ada.pdf')
      .attach('files', fakeResume('Bob', 'Java years: 2'), 'bob.pdf')
      .expect(202);
    const [ada, bob] = upload.body.results.map(
      (r: { resumeId: string }) => r.resumeId,
    );

    const processed = await Promise.all([
      waitForStatus(ada, ResumeStatus.Processed),
      waitForStatus(bob, ResumeStatus.Processed),
    ]);
    // One of them hit the failure and needed a second attempt.
    expect(processed.map((r) => r.attempts).sort((a, b) => a - b)).toEqual([
      1, 2,
    ]);

    const candidates = await db
      .getRepository(Candidate)
      .findBy({ jobId: job.body.id });
    const scores = candidates
      .map((c) => [c.fullName, c.matchScore] as const)
      .sort(([a], [b]) => String(a).localeCompare(String(b)));
    expect(scores).toEqual([
      ['Ada', 90],
      ['Bob', 45],
    ]);
  });
});
