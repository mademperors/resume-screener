import type { DataSource } from 'typeorm';
import { Session } from '@src/auth/session.entity.js';
import { Candidate } from '@src/candidates/candidate.entity.js';
import { Job } from '@src/jobs/job.entity.js';
import { ResumeProcessor } from '@src/processing/resume-processor.service.js';
import { RetentionService } from '@src/processing/retention.service.js';
import { Resume } from '@src/resumes/resume.entity.js';
import { PendingFileDeletion } from '@src/storage/pending-file-deletion.entity.js';
import { makePdf } from '../support/documents.js';
import { bearer, createHarness, type Harness } from '../support/harness.js';

describe('Data retention', () => {
  let h: Harness;
  let token: string;
  let db: DataSource;
  const daysAgo = (days: number) => new Date(Date.now() - days * 86_400_000);

  beforeAll(async () => {
    h = await createHarness();
    token = await h.signIn('retention');
    db = h.db;
  });

  afterAll(() => h?.close());

  /** A job with one processed candidate; returns ids and the file key. */
  async function jobWithCandidate(title: string) {
    const job = await h
      .http()
      .post('/api/v1/jobs')
      .set(bearer(token))
      .send({
        title,
        description: 'x',
        requiredSkills: ['TypeScript'],
        minExperienceYears: 0,
      })
      .expect(201);
    const pdf = await makePdf([
      { text: 'Jane Doe' },
      { text: 'Backend engineer with TypeScript and 5 years of experience.' },
    ]);
    const upload = await h
      .http()
      .post(`/api/v1/jobs/${job.body.id}/resumes`)
      .set(bearer(token))
      .attach('files', pdf, 'jane.pdf')
      .expect(202);
    const resumeId = upload.body.results[0].resumeId as string;
    const task = h.queue.tasks.find((t) => t.resumeId === resumeId)!;
    await h.app
      .get(ResumeProcessor)
      .process(task, { attemptsMade: 0, maxAttempts: 1 });
    const resume = await db
      .getRepository(Resume)
      .findOneByOrFail({ id: resumeId });
    return {
      jobId: job.body.id as string,
      resumeId,
      storageKey: resume.storageKey,
    };
  }

  it('purges data of jobs closed or deleted more than a year ago', async () => {
    const oldClosed = await jobWithCandidate('Old closed');
    const oldDeleted = await jobWithCandidate('Old deleted');
    const recentClosed = await jobWithCandidate('Recently closed');
    const open = await jobWithCandidate('Open');

    const jobs = db.getRepository(Job);
    await h
      .http()
      .post(`/api/v1/jobs/${oldClosed.jobId}/close`)
      .set(bearer(token))
      .expect(200);
    await jobs.update(oldClosed.jobId, { closedAt: daysAgo(400) });
    await h
      .http()
      .delete(`/api/v1/jobs/${oldDeleted.jobId}`)
      .set(bearer(token))
      .expect(204);
    await jobs.update(oldDeleted.jobId, { deletedAt: daysAgo(400) });
    await h
      .http()
      .post(`/api/v1/jobs/${recentClosed.jobId}/close`)
      .set(bearer(token))
      .expect(200);
    await jobs.update(recentClosed.jobId, { closedAt: daysAgo(100) });

    const result = await h.app.get(RetentionService).run();
    expect(result.resumesRemoved).toBe(2);

    const resumes = db.getRepository(Resume);
    const candidates = db.getRepository(Candidate);
    for (const purged of [oldClosed, oldDeleted]) {
      expect(await resumes.findOneBy({ id: purged.resumeId })).toBeNull();
      expect(
        await candidates.findOneBy({ resumeId: purged.resumeId }),
      ).toBeNull();
      expect(await h.fileExists(purged.storageKey)).toBe(false);
    }
    // The closed job stays as an empty record; the deleted one is gone.
    expect(await jobs.findOneBy({ id: oldClosed.jobId })).not.toBeNull();
    expect(
      await jobs.findOne({
        where: { id: oldDeleted.jobId },
        withDeleted: true,
      }),
    ).toBeNull();

    for (const kept of [recentClosed, open]) {
      expect(await resumes.findOneBy({ id: kept.resumeId })).not.toBeNull();
      expect(
        await candidates.findOneBy({ resumeId: kept.resumeId }),
      ).not.toBeNull();
      expect(await h.fileExists(kept.storageKey)).toBe(true);
    }
  });

  it('retries deleting files storage refused earlier', async () => {
    const { storageKey } = await jobWithCandidate('Pending file');
    const pending = db.getRepository(PendingFileDeletion);
    const row = await pending.save(pending.create({ storageKey, attempts: 2 }));
    expect(await h.fileExists(storageKey)).toBe(true);

    await h.app.get(RetentionService).run();

    expect(await h.fileExists(storageKey)).toBe(false);
    expect(await pending.findOneBy({ id: row.id })).toBeNull();
  });

  it('keeps the record when storage is still unavailable', async () => {
    const pending = db.getRepository(PendingFileDeletion);
    const row = await pending.save(
      pending.create({ storageKey: 'some/key', attempts: 0 }),
    );
    vi.spyOn(h.storage, 'delete').mockRejectedValue(new Error('storage down'));

    const result = await h.app.get(RetentionService).run();

    expect(result.filesPendingDeletion).toBe(1);
    expect(await pending.findOneByOrFail({ id: row.id })).toMatchObject({
      attempts: 1,
      lastError: 'storage down',
    });
  });

  it('deletes sign-in sessions that have ended and keeps active ones', async () => {
    const sessionOf = async (accessToken: string) => {
      const payload = JSON.parse(
        Buffer.from(accessToken.split('.')[1], 'base64url').toString(),
      ) as { sid: string };
      return payload.sid;
    };
    const active = await h.signIn('session-active');
    const signedOut = await h.signIn('session-signed-out');
    const expired = await h.signIn('session-expired');
    const idle = await h.signIn('session-idle');
    await h
      .http()
      .post('/api/v1/auth/logout')
      .set(bearer(signedOut))
      .expect(204);
    const sessions = db.getRepository(Session);
    await sessions.update(await sessionOf(expired), { expiresAt: daysAgo(1) });
    await sessions.update(await sessionOf(idle), {
      lastActivityAt: new Date(Date.now() - 2 * 3_600_000),
    });

    const result = await h.app.get(RetentionService).run();
    expect(result.sessionsRemoved).toBe(3);

    for (const ended of [signedOut, expired, idle]) {
      expect(
        await sessions.findOneBy({ id: await sessionOf(ended) }),
      ).toBeNull();
    }
    expect(
      await sessions.findOneBy({ id: await sessionOf(active) }),
    ).not.toBeNull();
    await h.http().get('/api/v1/auth/me').set(bearer(active)).expect(200);
  });
});
