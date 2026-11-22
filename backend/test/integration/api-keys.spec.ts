import { ApiKey } from '@src/api-keys/api-key.entity.js';
import { sha256Hex } from '@src/common/crypto.js';
import { integrationEnv } from '../support/test-env.js';
import { bearer, createHarness, type Harness } from '../support/harness.js';

const ADMIN_TOKEN = integrationEnv.ADMIN_API_TOKEN;

describe('API keys and rate limits', () => {
  let h: Harness;

  beforeAll(async () => {
    h = await createHarness();
  });

  afterAll(() => h?.close());

  async function createKey(token: string) {
    const created = await h
      .http()
      .post('/api/v1/api-keys')
      .set(bearer(token))
      .send({ name: 'ATS' })
      .expect(201);
    return created.body as { id: string; key: string };
  }

  const jobsWithKey = (key: string) =>
    h.http().get('/api/v1/jobs').set('X-API-Key', key);

  it('stores only a hash of the key and shows the key once', async () => {
    const token = await h.signIn('carol');
    const { id, key } = await createKey(token);

    const stored = await h.db.getRepository(ApiKey).findOneByOrFail({ id });
    expect(stored.keyHash).toBe(sha256Hex(key));
    const listed = await h
      .http()
      .get('/api/v1/api-keys')
      .set(bearer(token))
      .expect(200);
    expect(JSON.stringify(listed.body)).not.toContain(key);
  });

  it('authenticates with a key and refuses session-only routes', async () => {
    const { key } = await createKey(await h.signIn('dave'));

    const jobs = await jobsWithKey(key).expect(200);
    expect(jobs.headers['x-ratelimit-limit']).toBe('200');
    await h.http().get('/api/v1/api-keys').set('X-API-Key', key).expect(403);
  });

  it('rejects unknown, malformed and wrongly signed keys', async () => {
    const { key } = await createKey(await h.signIn('erin'));
    const wrongSecret = `${key.slice(0, -1)}${key.endsWith('A') ? 'B' : 'A'}`;

    await jobsWithKey(`rsk_000000000000_${'a'.repeat(43)}`).expect(401);
    await jobsWithKey('not-a-key').expect(401);
    await jobsWithKey(wrongSecret).expect(401);
  });

  it('stops accepting a revoked key', async () => {
    const token = await h.signIn('frank');
    const { id, key } = await createKey(token);

    await h
      .http()
      .delete(`/api/v1/api-keys/${id}`)
      .set(bearer(token))
      .expect(200);
    await jobsWithKey(key).expect(401);
  });

  it("forbids revoking another company's API key", async () => {
    const { id } = await createKey(await h.signIn('owner'));
    const stranger = await h.signIn('stranger');

    await h
      .http()
      .delete(`/api/v1/api-keys/${id}`)
      .set(bearer(stranger))
      .expect(403);
  });

  it("limits a key to its company's requests per minute, shared in Redis", async () => {
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
    const { key } = await createKey(token);

    await jobsWithKey(key).expect(200);
    await jobsWithKey(key).expect(200);
    const limited = await jobsWithKey(key).expect(429);
    expect(limited.body.message).toMatch(/limited to 2 requests per minute/);
    expect(Number(limited.headers['retry-after'])).toBeGreaterThan(0);
    expect(limited.headers['x-ratelimit-remaining']).toBe('0');

    // Each key has its own counter, and signed-in users aren't limited.
    const other = await createKey(token);
    await jobsWithKey(other.key).expect(200);
    await h.http().get('/api/v1/jobs').set(bearer(token)).expect(200);
  });
});
