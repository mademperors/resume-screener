import { bearer, createHarness, hasDatabase, type Harness } from './harness.js';

const ADMIN_TOKEN = 'e2e-admin-token-e2e-admin-token-e2e';

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
    await h
      .http()
      .patch(`/api/v1/admin/companies/${me.body.company.id}/plan`)
      .set('X-Admin-Token', ADMIN_TOKEN)
      .send({ plan: 'standard', customRateLimitPerMinute: 2 })
      .expect(200);
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

  describe('plans and the admin API', () => {
    const admin = () => ({ 'X-Admin-Token': ADMIN_TOKEN });

    it('shows the company plan to signed-in users', async () => {
      const token = await h.signIn('plan-viewer');
      const me = await h
        .http()
        .get('/api/v1/auth/me')
        .set(bearer(token))
        .expect(200);
      expect(me.body.company).toMatchObject({
        plan: 'standard',
        apiRateLimitPerMinute: 200,
        customRateLimitPerMinute: null,
      });
    });

    it('requires the admin token', async () => {
      await h.http().get('/api/v1/admin/plans').expect(401);
      await h
        .http()
        .get('/api/v1/admin/plans')
        .set('X-Admin-Token', 'wrong')
        .expect(401);
      // A user session is not enough.
      const token = await h.signIn('not-admin');
      await h.http().get('/api/v1/admin/plans').set(bearer(token)).expect(401);
    });

    it('lists plans and finds companies', async () => {
      const plans = await h
        .http()
        .get('/api/v1/admin/plans')
        .set(admin())
        .expect(200);
      expect(plans.body).toEqual([
        { plan: 'standard', apiRateLimitPerMinute: 200 },
        { plan: 'extended', apiRateLimitPerMinute: 1000 },
      ]);

      const token = await h.signIn('findable');
      const me = await h
        .http()
        .get('/api/v1/auth/me')
        .set(bearer(token))
        .expect(200);
      const found = await h
        .http()
        .get(
          `/api/v1/admin/companies?search=${encodeURIComponent(me.body.email)}`,
        )
        .set(admin())
        .expect(200);
      expect(found.body).toEqual([
        expect.objectContaining({ id: me.body.company.id, plan: 'standard' }),
      ]);
    });

    it('upgrades a company and its API keys get the new limit', async () => {
      const token = await h.signIn('upgrader');
      const me = await h
        .http()
        .get('/api/v1/auth/me')
        .set(bearer(token))
        .expect(200);
      const created = await h
        .http()
        .post('/api/v1/api-keys')
        .set(bearer(token))
        .send({ name: 'ATS' })
        .expect(201);

      const upgraded = await h
        .http()
        .patch(`/api/v1/admin/companies/${me.body.company.id}/plan`)
        .set(admin())
        .send({ plan: 'extended' })
        .expect(200);
      expect(upgraded.body).toMatchObject({
        plan: 'extended',
        apiRateLimitPerMinute: 1000,
        customRateLimitPerMinute: null,
      });

      const jobs = await h
        .http()
        .get('/api/v1/jobs')
        .set('X-API-Key', created.body.key)
        .expect(200);
      expect(jobs.headers['x-ratelimit-limit']).toBe('1000');

      // A custom limit wins over the plan, and null removes it again.
      const custom = await h
        .http()
        .patch(`/api/v1/admin/companies/${me.body.company.id}/plan`)
        .set(admin())
        .send({ plan: 'extended', customRateLimitPerMinute: 5000 })
        .expect(200);
      expect(custom.body.apiRateLimitPerMinute).toBe(5000);
      const cleared = await h
        .http()
        .patch(`/api/v1/admin/companies/${me.body.company.id}/plan`)
        .set(admin())
        .send({ plan: 'standard', customRateLimitPerMinute: null })
        .expect(200);
      expect(cleared.body).toMatchObject({
        plan: 'standard',
        apiRateLimitPerMinute: 200,
        customRateLimitPerMinute: null,
      });
    });

    it('validates plan changes', async () => {
      await h
        .http()
        .patch(
          '/api/v1/admin/companies/00000000-0000-0000-0000-000000000000/plan',
        )
        .set(admin())
        .send({ plan: 'extended' })
        .expect(404);
      const invalid = await h
        .http()
        .patch(
          '/api/v1/admin/companies/00000000-0000-0000-0000-000000000000/plan',
        )
        .set(admin())
        .send({ plan: 'gold', customRateLimitPerMinute: 0 })
        .expect(400);
      expect(
        invalid.body.errors.map((e: { field: string }) => e.field),
      ).toEqual(['plan', 'customRateLimitPerMinute']);
    });
  });
});
