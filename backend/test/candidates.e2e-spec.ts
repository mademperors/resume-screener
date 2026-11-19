import { DataSource } from 'typeorm';
import { ResumeProcessor } from './../src/processing/resume-processor.service.js';
import { Resume } from './../src/resumes/resume.entity.js';
import { PendingFileDeletion } from './../src/storage/pending-file-deletion.entity.js';
import { makeEmptyPdf, makePdf } from './documents.js';
import { bearer, createHarness, hasDatabase, type Harness } from './harness.js';

interface Summary {
  id: string;
  resumeId: string;
  name: string;
  matchScore: number;
  belowThreshold: boolean;
  warnings: string[];
  status: string;
}

describe.skipIf(!hasDatabase)('Candidates and progress (e2e)', () => {
  let h: Harness;
  let token: string;
  let jobId: string;

  beforeAll(async () => {
    h = await createHarness();
    token = await h.signIn('candidates');
    const job = await h
      .http()
      .post('/api/v1/jobs')
      .set(bearer(token))
      .send({
        title: 'Backend Engineer',
        description: 'APIs',
        requiredSkills: ['TypeScript', 'PostgreSQL'],
        preferredSkills: ['Docker'],
        minExperienceYears: 3,
        minMatchScore: 60,
      })
      .expect(201);
    jobId = job.body.id;

    const resumes: [string, string[]][] = [
      [
        'Alice Strong',
        ['8 years of experience.', 'TypeScript, PostgreSQL, Docker, Kafka.'],
      ],
      ['Bob Brown', ['4 years of experience.', 'TypeScript and PostgreSQL.']],
      ['Carol White', ['1 year of experience.', 'Docker and TypeScript.']],
      ['Dan Green', ['TypeScript, PostgreSQL, Docker every day.']],
    ];
    const upload = h
      .http()
      .post(`/api/v1/jobs/${jobId}/resumes`)
      .set(bearer(token));
    for (const [name, lines] of resumes) {
      upload.attach(
        'files',
        await makePdf([
          { text: name },
          { text: 'Worked on backend services for online retail platforms.' },
          ...lines.map((text) => ({ text })),
        ]),
        `${name}.pdf`,
      );
    }
    upload.attach('files', await makeEmptyPdf(), 'scan.pdf');
    const response = await upload.expect(202);
    const ids = response.body.results.map(
      (r: { resumeId: string }) => r.resumeId,
    );
    const processor = h.app.get(ResumeProcessor);
    for (const task of h.queue.tasks.filter((t) => ids.includes(t.resumeId))) {
      await processor.process(task, { attemptsMade: 0, maxAttempts: 3 });
    }
  });

  afterAll(async () => {
    await h?.app.close();
  });

  const list = async (query = '') =>
    (
      await h
        .http()
        .get(`/api/v1/jobs/${jobId}/candidates${query}`)
        .set(bearer(token))
        .expect(200)
    ).body as { items: Summary[]; total: number; minMatchScore: number };

  const byName = (items: Summary[], name: string) =>
    items.find((c) => c.name === name)!;

  it('reports progress', async () => {
    const progress = await h
      .http()
      .get(`/api/v1/jobs/${jobId}/progress`)
      .set(bearer(token))
      .expect(200);
    expect(progress.body).toEqual({
      total: 5,
      queued: 0,
      processing: 0,
      processed: 4,
      failed: 1,
      processingFailed: 0,
      couldNotRead: 1,
      done: true,
      summary: 'Processed 4 of 5, 1 failed',
    });
  });

  it('ranks by score with candidates below the minimum last', async () => {
    const page = await list();
    expect(page.total).toBe(4);
    expect(page.minMatchScore).toBe(60);
    expect(page.items.map((c) => c.name)).toEqual([
      'Alice Strong',
      'Bob Brown',
      'Dan Green',
      'Carol White',
    ]);
    expect(page.items.map((c) => c.belowThreshold)).toEqual([
      false,
      false,
      false,
      true,
    ]);
    expect(byName(page.items, 'Dan Green').warnings).toEqual([
      'Needs manual review',
    ]);
    expect(byName(page.items, 'Carol White').warnings).toEqual([
      'Does not meet requirements',
    ]);
  });

  it('sorts by other columns, still keeping below-minimum candidates last', async () => {
    const page = await list('?sortBy=name&order=asc');
    expect(page.items.map((c) => c.name)).toEqual([
      'Alice Strong',
      'Bob Brown',
      'Dan Green',
      'Carol White',
    ]);
  });

  it('filters by skills, score, experience and warnings', async () => {
    expect((await list('?skills=kafka')).items.map((c) => c.name)).toEqual([
      'Alice Strong',
    ]);
    expect((await list('?skills=TypeScript,Docker')).total).toBe(3);
    expect((await list('?minScore=80')).items.map((c) => c.name)).toEqual([
      'Alice Strong',
      'Bob Brown',
    ]);
    expect((await list('?minExperience=4')).total).toBe(2);
    expect((await list('?hasWarnings=false')).items.map((c) => c.name)).toEqual(
      ['Alice Strong', 'Bob Brown'],
    );
    expect((await list('?skills=cobol')).items).toEqual([]);
    await h
      .http()
      .get(`/api/v1/jobs/${jobId}/candidates?minScore=500`)
      .set(bearer(token))
      .expect(400);
  });

  it('shows the candidate card with each requirement', async () => {
    const alice = byName((await list()).items, 'Alice Strong');
    const card = await h
      .http()
      .get(`/api/v1/candidates/${alice.id}`)
      .set(bearer(token))
      .expect(200);
    expect(card.body).toMatchObject({
      contacts: { name: 'Alice Strong' },
      experienceYears: 8,
      missingSkills: [],
      warnings: [],
      status: 'Pending',
      evaluation: { configVersion: 1, modelName: 'mock-keyword-matcher' },
      resume: { filename: 'Alice Strong.pdf' },
    });
    expect(card.body.foundSkills).toEqual(expect.arrayContaining(['Kafka']));
    expect(card.body.requirements).toHaveLength(4);
    expect(card.body.requirements[0]).toMatchObject({
      requirementId: 'skill:typescript',
      met: true,
      evidence: 'Mentions TypeScript',
    });
  });

  it('changes the decision and filters by it', async () => {
    const bob = byName((await list()).items, 'Bob Brown');
    const updated = await h
      .http()
      .patch(`/api/v1/candidates/${bob.id}/status`)
      .set(bearer(token))
      .send({ status: 'Approved' })
      .expect(200);
    expect(updated.body.status).toBe('Approved');
    expect((await list('?status=Approved')).items.map((c) => c.name)).toEqual([
      'Bob Brown',
    ]);
    await h
      .http()
      .patch(`/api/v1/candidates/${bob.id}/status`)
      .set(bearer(token))
      .send({ status: 'Maybe' })
      .expect(400);
  });

  it('gives a short-lived link to the original file', async () => {
    const alice = byName((await list()).items, 'Alice Strong');
    const link = await h
      .http()
      .get(`/api/v1/candidates/${alice.id}/resume-file`)
      .set(bearer(token))
      .expect(200);
    expect(link.body.url).toMatch(
      /^https:\/\/storage\.test\/companies\/.+expires=300/,
    );
    expect(new Date(link.body.expiresAt).getTime()).toBeGreaterThan(Date.now());
  });

  it('links processed resumes to their candidates', async () => {
    const resumes = await h
      .http()
      .get(`/api/v1/jobs/${jobId}/resumes`)
      .set(bearer(token))
      .expect(200);
    const withCandidate = resumes.body.items.filter(
      (r: { candidateId: string | null }) => r.candidateId,
    );
    expect(withCandidate).toHaveLength(4);
  });

  it('deletes a candidate with the resume and the file', async () => {
    const carol = byName((await list()).items, 'Carol White');
    const db = h.app.get(DataSource);
    const resume = await db
      .getRepository(Resume)
      .findOneByOrFail({ id: carol.resumeId });
    expect(h.storage.files.has(resume.storageKey)).toBe(true);

    await h
      .http()
      .delete(`/api/v1/candidates/${carol.id}`)
      .set(bearer(token))
      .expect(204);

    await h
      .http()
      .get(`/api/v1/candidates/${carol.id}`)
      .set(bearer(token))
      .expect(404);
    expect(
      await db.getRepository(Resume).findOneBy({ id: carol.resumeId }),
    ).toBeNull();
    expect(h.storage.files.has(resume.storageKey)).toBe(false);
    expect(
      await db
        .getRepository(PendingFileDeletion)
        .countBy({ storageKey: resume.storageKey }),
    ).toBe(0);
  });

  it('deletes an unreadable resume', async () => {
    const failed = await h
      .http()
      .get(
        `/api/v1/jobs/${jobId}/resumes?status=${encodeURIComponent('Could not read file')}`,
      )
      .set(bearer(token))
      .expect(200);
    const resumeId = failed.body.items[0].id;
    await h
      .http()
      .delete(`/api/v1/resumes/${resumeId}`)
      .set(bearer(token))
      .expect(204);
    const progress = await h
      .http()
      .get(`/api/v1/jobs/${jobId}/progress`)
      .set(bearer(token))
      .expect(200);
    expect(progress.body.couldNotRead).toBe(0);
  });

  it("forbids access to another company's candidates", async () => {
    const alice = byName((await list()).items, 'Alice Strong');
    const stranger = await h.signIn('stranger');
    // Created one at a time: supertest starts a server per pending request.
    const requests = [
      () => h.http().get(`/api/v1/candidates/${alice.id}`),
      () => h.http().get(`/api/v1/candidates/${alice.id}/resume-file`),
      () =>
        h
          .http()
          .patch(`/api/v1/candidates/${alice.id}/status`)
          .send({ status: 'Rejected' }),
      () => h.http().delete(`/api/v1/candidates/${alice.id}`),
      () => h.http().get(`/api/v1/jobs/${jobId}/candidates`),
      () => h.http().get(`/api/v1/jobs/${jobId}/progress`),
    ];
    for (const request of requests) {
      await request().set(bearer(stranger)).expect(403);
    }
  });
});
