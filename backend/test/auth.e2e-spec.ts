import { DataSource } from 'typeorm';
import { Company } from './../src/companies/company.entity.js';
import { bearer, createHarness, hasDatabase, type Harness } from './harness.js';

describe.skipIf(!hasDatabase)('Auth and API keys (e2e)', () => {
  let h: Harness;

  beforeAll(async () => {
    h = await createHarness();
  });

  afterAll(async () => {
    await h?.app.close();
  });

  it('serves health without auth', () =>
    h.http().get('/api/v1/health').expect(200, { status: 'ok' }));

  it('returns 401 without credentials, in the common error shape', async () => {
    const response = await h.http().get('/api/v1/jobs').expect(401);
    expect(response.body).toMatchObject({
      statusCode: 401,
      error: 'Unauthorized',
    });
    expect(response.body.message).toMatch(/Sign in with Google/);
  });

  it('returns 401 for an unknown API key', () =>
    h
      .http()
      .get('/api/v1/jobs')
      .set('X-API-Key', `rsk_000000000000_${'a'.repeat(43)}`)
      .expect(401));

  it('signs in with Google and returns the profile', async () => {
    const token = await h.signIn('alice');
    const me = await h
      .http()
      .get('/api/v1/auth/me')
      .set(bearer(token))
      .expect(200);
    expect(me.body.email).toMatch(/^alice-.*@example\.com$/);
    expect(me.body.company.apiRateLimitPerMinute).toBe(200);
  });

  it('signs out and rejects the old access token', async () => {
    const token = await h.signIn('bob');
    await h.http().post('/api/v1/auth/logout').set(bearer(token)).expect(204);
    await h.http().get('/api/v1/auth/me').set(bearer(token)).expect(401);
  });

  it('creates, uses and revokes an API key', async () => {
    const token = await h.signIn('carol');
    const created = await h
      .http()
      .post('/api/v1/api-keys')
      .set(bearer(token))
      .send({ name: 'ATS' })
      .expect(201);
    const key = created.body.key as string;

    const listed = await h
      .http()
      .get('/api/v1/api-keys')
      .set(bearer(token))
      .expect(200);
    expect(JSON.stringify(listed.body)).not.toContain(key);

    const jobs = await h
      .http()
      .get('/api/v1/jobs')
      .set('X-API-Key', key)
      .expect(200);
    expect(jobs.headers['x-ratelimit-limit']).toBe('200');

    await h.http().get('/api/v1/api-keys').set('X-API-Key', key).expect(403);

    await h
      .http()
      .delete(`/api/v1/api-keys/${created.body.id}`)
      .set(bearer(token))
      .expect(200);
    await h.http().get('/api/v1/jobs').set('X-API-Key', key).expect(401);
  });

  it("forbids revoking another company's API key", async () => {
    const owner = await h.signIn('dave');
    const created = await h
      .http()
      .post('/api/v1/api-keys')
      .set(bearer(owner))
      .send({ name: 'ATS' })
      .expect(201);

    const stranger = await h.signIn('erin');
    await h
      .http()
      .delete(`/api/v1/api-keys/${created.body.id}`)
      .set(bearer(stranger))
      .expect(403);
  });

  it('reports readiness of the database, queue and storage', () =>
    h
      .http()
      .get('/api/v1/health/ready')
      .expect(200, {
        status: 'ok',
        checks: { database: 'up', queue: 'up', storage: 'up' },
      }));

  it('serves the OpenAPI document', async () => {
    const response = await h.http().get('/api/docs-json').expect(200);
    expect(response.body.openapi).toMatch(/^3./);
    expect(Object.keys(response.body.paths)).toEqual(
      expect.arrayContaining([
        '/api/v1/jobs',
        '/api/v1/jobs/{jobId}/resumes',
        '/api/v1/jobs/{jobId}/candidates',
        '/api/v1/jobs/{jobId}/candidates/export.csv',
        '/api/v1/health/ready',
      ]),
    );
  });

  it("limits an API key to its company's requests per minute, shared in Redis", async () => {
    const token = await h.signIn('limited');
    const me = await h
      .http()
      .get('/api/v1/auth/me')
      .set(bearer(token))
      .expect(200);
    await h.app
      .get(DataSource)
      .getRepository(Company)
      .update(me.body.company.id, { apiRateLimitPerMinute: 2 });
    const created = await h
      .http()
      .post('/api/v1/api-keys')
      .set(bearer(token))
      .send({ name: 'ATS' })
      .expect(201);
    const key = created.body.key as string;

    await h.http().get('/api/v1/jobs').set('X-API-Key', key).expect(200);
    await h.http().get('/api/v1/jobs').set('X-API-Key', key).expect(200);
    const limited = await h
      .http()
      .get('/api/v1/jobs')
      .set('X-API-Key', key)
      .expect(429);
    expect(limited.body.message).toMatch(/limited to 2 requests per minute/);
    expect(Number(limited.headers['retry-after'])).toBeGreaterThan(0);
    // Signed-in users aren't limited.
    await h.http().get('/api/v1/jobs').set(bearer(token)).expect(200);
  });
});
