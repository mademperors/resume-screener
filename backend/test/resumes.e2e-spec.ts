import { DOCX_BYTES, PDF_BYTES } from './../src/resumes/resume-fixtures.js';
import { bearer, createHarness, hasDatabase, type Harness } from './harness.js';

describe.skipIf(!hasDatabase)('Resume upload (e2e)', () => {
  let h: Harness;
  let token: string;

  beforeAll(async () => {
    h = await createHarness();
    token = await h.signIn('uploader');
  });

  afterAll(async () => {
    await h?.app.close();
  });

  const createJob = async (as = token) =>
    (
      await h
        .http()
        .post('/api/v1/jobs')
        .set(bearer(as))
        .send({
          title: 'Backend Engineer',
          description: 'APIs',
          requiredSkills: ['TypeScript'],
          minExperienceYears: 2,
        })
        .expect(201)
    ).body as { id: string; configVersion: number };

  const upload = (jobId: string, files: [string, Buffer][], query = '') => {
    const req = h
      .http()
      .post(`/api/v1/jobs/${jobId}/resumes${query}`)
      .set(bearer(token));
    for (const [name, content] of files) {
      req.attach('files', content, name);
    }
    return req;
  };

  it('accepts PDF and DOCX, rejects others, and queues the accepted ones', async () => {
    const job = await createJob();
    const queuedBefore = h.queue.tasks.length;

    const response = await upload(job.id, [
      ['Іван Петренко.pdf', PDF_BYTES],
      ['jane.docx', DOCX_BYTES],
      ['notes.txt', Buffer.from('hello')],
    ]).expect(202);

    expect(response.body).toMatchObject({
      accepted: 2,
      rejected: 1,
      duplicates: 0,
    });
    const [pdf, docx, txt] = response.body.results;
    // Multipart file names are read as UTF-8.
    expect(pdf).toMatchObject({
      filename: 'Іван Петренко.pdf',
      status: 'accepted',
    });
    expect(docx.status).toBe('accepted');
    expect(txt).toMatchObject({
      status: 'rejected',
      reason: 'Unsupported file format. Upload a PDF or DOCX file.',
    });

    const queued = h.queue.tasks.slice(queuedBefore);
    expect(queued.map((t) => t.resumeId)).toEqual([
      pdf.resumeId,
      docx.resumeId,
    ]);

    const list = await h
      .http()
      .get(`/api/v1/jobs/${job.id}/resumes`)
      .set(bearer(token))
      .expect(200);
    expect(list.body.total).toBe(2);
    expect(list.body.items[0]).toMatchObject({ status: 'Queued', attempts: 0 });
    expect(h.storage.files.size).toBeGreaterThanOrEqual(2);
  });

  it('reports duplicates and uploads them again on request', async () => {
    const job = await createJob();
    const first = await upload(job.id, [['a.pdf', PDF_BYTES]]).expect(202);

    const again = await upload(job.id, [['a (1).pdf', PDF_BYTES]]).expect(202);
    expect(again.body.results[0]).toMatchObject({
      status: 'duplicate',
      duplicateOfResumeId: first.body.results[0].resumeId,
    });

    const kept = await upload(
      job.id,
      [['a (1).pdf', PDF_BYTES]],
      '?onDuplicate=keep',
    ).expect(202);
    expect(kept.body.accepted).toBe(1);
  });

  it('suggests re-scoring after requirements change once resumes exist', async () => {
    const job = await createJob();
    await upload(job.id, [['a.pdf', PDF_BYTES]]).expect(202);

    const updated = await h
      .http()
      .patch(`/api/v1/jobs/${job.id}`)
      .set(bearer(token))
      .send({ requiredSkills: ['TypeScript', 'SQL'] })
      .expect(200);
    expect(updated.body.rescoreSuggested).toBe(true);
  });

  it('rejects a request without files', async () => {
    const job = await createJob();
    const response = await h
      .http()
      .post(`/api/v1/jobs/${job.id}/resumes`)
      .set(bearer(token))
      .field('note', 'x')
      .expect(400);
    expect(response.body.message).toBe('Choose at least one PDF or DOCX file.');
  });

  it('rejects files above the hard limit with a readable message', async () => {
    const job = await createJob();
    const response = await upload(job.id, [
      ['huge.pdf', Buffer.alloc(26 * 1024 * 1024, 0x20)],
    ]).expect(413);
    expect(response.body.message).toMatch(/File is too large \(max 10 MB\)/);
  });

  it('refuses uploads to a closed job', async () => {
    const job = await createJob();
    await h
      .http()
      .post(`/api/v1/jobs/${job.id}/close`)
      .set(bearer(token))
      .expect(200);
    const response = await upload(job.id, [['a.pdf', PDF_BYTES]]).expect(409);
    expect(response.body.message).toMatch(/closed/);
  });

  it('keeps resumes Queued when the queue is down', async () => {
    const job = await createJob();
    h.queue.failNext = true;
    const response = await upload(job.id, [['a.pdf', PDF_BYTES]]).expect(202);
    expect(response.body.accepted).toBe(1);
    const list = await h
      .http()
      .get(`/api/v1/jobs/${job.id}/resumes?status=Queued`)
      .set(bearer(token))
      .expect(200);
    expect(list.body.total).toBe(1);
  });

  it("forbids uploading to or listing another company's job", async () => {
    const job = await createJob();
    const stranger = await h.signIn('stranger');
    await h
      .http()
      .post(`/api/v1/jobs/${job.id}/resumes`)
      .set(bearer(stranger))
      .attach('files', PDF_BYTES, 'a.pdf')
      .expect(403);
    await h
      .http()
      .get(`/api/v1/jobs/${job.id}/resumes`)
      .set(bearer(stranger))
      .expect(403);
  });
});
