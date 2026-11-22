import { Resume } from '@src/resumes/resume.entity.js';
import { StorageUnavailableError } from '@src/storage/file-storage.js';
import { DOCX_BYTES, PDF_BYTES } from '../support/fixtures.js';
import { bearer, createHarness, type Harness } from '../support/harness.js';

describe('Resume upload', () => {
  let h: Harness;
  let token: string;

  beforeAll(async () => {
    h = await createHarness();
    token = await h.signIn('uploader');
  });

  afterAll(() => h?.close());

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

  const resumesOf = (jobId: string) =>
    h.db.getRepository(Resume).find({ where: { jobId } });

  it('stores, records and queues PDF and DOCX files and rejects others', async () => {
    const job = await createJob();
    const queuedBefore = h.queue.tasks.length;

    const response = await upload(job.id, [
      ['Іван Петренко.pdf', PDF_BYTES],
      ['jane.docx', DOCX_BYTES],
      ['notes.txt', Buffer.from('hello')],
      ['empty.pdf', Buffer.alloc(0)],
    ]).expect(202);

    expect(response.body).toMatchObject({
      accepted: 2,
      rejected: 2,
      duplicates: 0,
    });
    const [pdf, docx, txt, empty] = response.body.results;
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
    expect(empty).toMatchObject({
      status: 'rejected',
      reason: 'File is empty.',
    });

    const queued = h.queue.tasks.slice(queuedBefore);
    expect(queued.map((t) => t.resumeId)).toEqual([
      pdf.resumeId,
      docx.resumeId,
    ]);

    const stored = await h.db
      .getRepository(Resume)
      .findOneByOrFail({ id: pdf.resumeId });
    expect(stored).toMatchObject({
      mimeType: 'application/pdf',
      storageKey: expect.stringMatching(
        new RegExp(`/jobs/${job.id}/resumes/${pdf.resumeId}$`),
      ),
    });
    expect(await h.storage.get(stored.storageKey)).toEqual(PDF_BYTES);

    const list = await h
      .http()
      .get(`/api/v1/jobs/${job.id}/resumes`)
      .set(bearer(token))
      .expect(200);
    expect(list.body.total).toBe(2);
    expect(list.body.items[0]).toMatchObject({ status: 'Queued', attempts: 0 });
  });

  it('reports duplicates, also within one upload, and uploads them again on request', async () => {
    const job = await createJob();
    const first = await upload(job.id, [
      ['a.pdf', PDF_BYTES],
      ['a copy.pdf', PDF_BYTES],
    ]).expect(202);
    expect(first.body.results.map((r: { status: string }) => r.status)).toEqual(
      ['accepted', 'duplicate'],
    );

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

  it('rejects only the file storage could not save', async () => {
    const job = await createJob();
    vi.spyOn(h.storage, 'put').mockRejectedValueOnce(
      new StorageUnavailableError('down'),
    );

    const response = await upload(job.id, [
      ['a.pdf', PDF_BYTES],
      ['b.docx', DOCX_BYTES],
    ]).expect(202);

    expect(response.body.results).toMatchObject([
      { status: 'rejected', reason: expect.stringMatching(/Could not save/) },
      { status: 'accepted' },
    ]);
    expect(await resumesOf(job.id)).toHaveLength(1);
  });

  it('removes the stored file when recording the resume fails', async () => {
    const job = await createJob();
    const put = vi.spyOn(h.storage, 'put');
    vi.spyOn(h.db.getRepository(Resume), 'save').mockRejectedValueOnce(
      new Error('database down'),
    );

    const response = await upload(job.id, [['a.pdf', PDF_BYTES]]).expect(202);

    expect(response.body.results[0].status).toBe('rejected');
    const [storedKey] = put.mock.calls[0];
    expect(await h.fileExists(storedKey)).toBe(false);
    expect(await resumesOf(job.id)).toHaveLength(0);
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
