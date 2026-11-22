import { integrationEnv } from '../support/test-env.js';
import { bearer, createHarness, type Harness } from '../support/harness.js';

const admin = () => ({ 'X-Admin-Token': integrationEnv.ADMIN_API_TOKEN });

describe('Plans and the admin API', () => {
  let h: Harness;

  beforeAll(async () => {
    h = await createHarness();
  });

  afterAll(() => h?.close());

  async function me(token: string) {
    const response = await h
      .http()
      .get('/api/v1/auth/me')
      .set(bearer(token))
      .expect(200);
    return response.body as {
      email: string;
      company: { id: string; plan: string };
    };
  }

  it('shows the company plan to signed-in users', async () => {
    const profile = await me(await h.signIn('plan-viewer'));
    expect(profile.company).toMatchObject({
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

    const profile = await me(await h.signIn('findable'));
    const found = await h
      .http()
      .get(
        `/api/v1/admin/companies?search=${encodeURIComponent(profile.email)}`,
      )
      .set(admin())
      .expect(200);
    expect(found.body).toEqual([
      expect.objectContaining({ id: profile.company.id, plan: 'standard' }),
    ]);
  });

  it('upgrades a company and its API keys get the new limit', async () => {
    const token = await h.signIn('upgrader');
    const profile = await me(token);
    const created = await h
      .http()
      .post('/api/v1/api-keys')
      .set(bearer(token))
      .send({ name: 'ATS' })
      .expect(201);
    const setPlan = (body: object) =>
      h
        .http()
        .patch(`/api/v1/admin/companies/${profile.company.id}/plan`)
        .set(admin())
        .send(body)
        .expect(200);

    const upgraded = await setPlan({ plan: 'extended' });
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
    const custom = await setPlan({
      plan: 'extended',
      customRateLimitPerMinute: 5000,
    });
    expect(custom.body.apiRateLimitPerMinute).toBe(5000);
    const cleared = await setPlan({
      plan: 'standard',
      customRateLimitPerMinute: null,
    });
    expect(cleared.body).toMatchObject({
      plan: 'standard',
      apiRateLimitPerMinute: 200,
      customRateLimitPerMinute: null,
    });
  });

  it('validates plan changes', async () => {
    const unknown =
      '/api/v1/admin/companies/00000000-0000-0000-0000-000000000000/plan';
    await h
      .http()
      .patch(unknown)
      .set(admin())
      .send({ plan: 'extended' })
      .expect(404);
    const invalid = await h
      .http()
      .patch(unknown)
      .set(admin())
      .send({ plan: 'gold', customRateLimitPerMinute: 0 })
      .expect(400);
    expect(invalid.body.errors.map((e: { field: string }) => e.field)).toEqual([
      'plan',
      'customRateLimitPerMinute',
    ]);
  });
});
