import { bearer, createHarness, hasDatabase, type Harness } from './harness.js';

const newJob = {
  title: '  Senior Backend Engineer ',
  description: 'Builds the screening API.',
  requiredSkills: ['TypeScript', 'PostgreSQL', 'typescript'],
  preferredSkills: ['Docker'],
  minExperienceYears: 3,
  minMatchScore: 60,
};

describe.skipIf(!hasDatabase)('Jobs (e2e)', () => {
  let h: Harness;
  let token: string;

  beforeAll(async () => {
    h = await createHarness();
    token = await h.signIn('recruiter');
  });

  afterAll(async () => {
    await h?.app.close();
  });

  const createJob = async (as = token, body: object = newJob) =>
    (await h.http().post('/api/v1/jobs').set(bearer(as)).send(body).expect(201))
      .body;

  it('creates a job with cleaned skills and config version 1', async () => {
    const job = await createJob();
    expect(job).toMatchObject({
      title: 'Senior Backend Engineer',
      requiredSkills: ['TypeScript', 'PostgreSQL'],
      preferredSkills: ['Docker'],
      minExperienceYears: 3,
      minMatchScore: 60,
      status: 'open',
      configVersion: 1,
    });

    const fetched = await h
      .http()
      .get(`/api/v1/jobs/${job.id}`)
      .set(bearer(token))
      .expect(200);
    expect(fetched.body.id).toBe(job.id);

    const list = await h
      .http()
      .get('/api/v1/jobs')
      .set(bearer(token))
      .expect(200);
    expect(list.body.map((j: { id: string }) => j.id)).toContain(job.id);
  });

  it('reports invalid fields', async () => {
    const response = await h
      .http()
      .post('/api/v1/jobs')
      .set(bearer(token))
      .send({
        title: ' ',
        description: 'x',
        requiredSkills: [],
        minExperienceYears: -1,
      })
      .expect(400);
    const fields = response.body.errors.map((e: { field: string }) => e.field);
    expect(fields).toEqual(
      expect.arrayContaining(['title', 'requiredSkills', 'minExperienceYears']),
    );
  });

  it('rejects a skill that is both required and preferred', async () => {
    const response = await h
      .http()
      .post('/api/v1/jobs')
      .set(bearer(token))
      .send({ ...newJob, preferredSkills: ['postgresql'] })
      .expect(400);
    expect(response.body.errors[0].field).toBe('preferredSkills');
  });

  it('creates a new config version only when requirements change', async () => {
    const job = await createJob();

    const renamed = await h
      .http()
      .patch(`/api/v1/jobs/${job.id}`)
      .set(bearer(token))
      .send({ title: 'Backend Engineer', minMatchScore: 70 })
      .expect(200);
    expect(renamed.body).toMatchObject({
      title: 'Backend Engineer',
      minMatchScore: 70,
      configVersion: 1,
      rescoreSuggested: false,
    });

    const changed = await h
      .http()
      .patch(`/api/v1/jobs/${job.id}`)
      .set(bearer(token))
      .send({ requiredSkills: ['TypeScript', 'PostgreSQL', 'Redis'] })
      .expect(200);
    expect(changed.body.configVersion).toBe(2);
    // No resumes yet, so there's nothing to re-score.
    expect(changed.body.rescoreSuggested).toBe(false);
  });

  it('closes, reopens and deletes a job', async () => {
    const job = await createJob();
    const closed = await h
      .http()
      .post(`/api/v1/jobs/${job.id}/close`)
      .set(bearer(token))
      .expect(200);
    expect(closed.body.status).toBe('closed');
    expect(closed.body.closedAt).not.toBeNull();

    const openJobs = await h
      .http()
      .get('/api/v1/jobs?status=open')
      .set(bearer(token))
      .expect(200);
    expect(openJobs.body.map((j: { id: string }) => j.id)).not.toContain(
      job.id,
    );

    const reopened = await h
      .http()
      .post(`/api/v1/jobs/${job.id}/reopen`)
      .set(bearer(token))
      .expect(200);
    expect(reopened.body).toMatchObject({ status: 'open', closedAt: null });

    await h
      .http()
      .delete(`/api/v1/jobs/${job.id}`)
      .set(bearer(token))
      .expect(204);
    await h.http().get(`/api/v1/jobs/${job.id}`).set(bearer(token)).expect(404);
  });

  it("forbids access to another company's job", async () => {
    const job = await createJob();
    const stranger = await h.signIn('stranger');

    await h
      .http()
      .get(`/api/v1/jobs/${job.id}`)
      .set(bearer(stranger))
      .expect(403);
    await h
      .http()
      .patch(`/api/v1/jobs/${job.id}`)
      .set(bearer(stranger))
      .send({ title: 'Hijacked' })
      .expect(403);
    await h
      .http()
      .delete(`/api/v1/jobs/${job.id}`)
      .set(bearer(stranger))
      .expect(403);

    const theirs = await h
      .http()
      .get('/api/v1/jobs')
      .set(bearer(stranger))
      .expect(200);
    expect(theirs.body).toEqual([]);
  });

  it('works with an API key', async () => {
    const created = await h
      .http()
      .post('/api/v1/api-keys')
      .set(bearer(token))
      .send({ name: 'ATS' })
      .expect(201);
    const job = await h
      .http()
      .post('/api/v1/jobs')
      .set('X-API-Key', created.body.key)
      .send(newJob)
      .expect(201);
    await h
      .http()
      .get(`/api/v1/jobs/${job.body.id}`)
      .set(bearer(token))
      .expect(200);
  });
});
