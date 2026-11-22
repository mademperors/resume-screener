import { Session } from '@src/auth/session.entity.js';
import { sha256Hex } from '@src/common/crypto.js';
import { Company } from '@src/companies/company.entity.js';
import { User } from '@src/users/user.entity.js';
import { bearer, createHarness, type Harness } from '../support/harness.js';

describe('Sign-in and sessions', () => {
  let h: Harness;

  beforeAll(async () => {
    h = await createHarness();
  });

  afterAll(() => h?.close());

  async function signInTokens(who: string) {
    const response = await h
      .http()
      .post('/api/v1/auth/google')
      .send({ idToken: who })
      .expect(200);
    return response.body as { accessToken: string; refreshToken: string };
  }

  const refresh = (refreshToken: string) =>
    h.http().post('/api/v1/auth/refresh').send({ refreshToken });

  async function sessionOf(refreshToken: string) {
    return h.db
      .getRepository(Session)
      .findOneByOrFail({ refreshTokenHash: sha256Hex(refreshToken) });
  }

  /** Moves the session's last activity into the past. */
  async function idleFor(session: Session, minutes: number) {
    await h.db.getRepository(Session).update(session.id, {
      lastActivityAt: new Date(Date.now() - minutes * 60_000),
    });
  }

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

  it('creates a user, a personal company and a session on first sign-in', async () => {
    const tokens = await signInTokens('alice');

    const me = await h
      .http()
      .get('/api/v1/auth/me')
      .set(bearer(tokens.accessToken))
      .expect(200);
    expect(me.body.email).toBe('alice@example.com');
    expect(me.body.company).toMatchObject({
      name: 'alice@example.com',
      apiRateLimitPerMinute: 200,
    });
    // Only a hash of the refresh token is stored.
    const session = await sessionOf(tokens.refreshToken);
    expect(session.refreshTokenHash).not.toContain(tokens.refreshToken);
  });

  it('reuses the user and company on later sign-ins', async () => {
    await signInTokens('repeat');
    await signInTokens('repeat');

    const users = await h.db
      .getRepository(User)
      .findBy({ email: 'repeat@example.com' });
    expect(users).toHaveLength(1);
    expect(
      await h.db.getRepository(Company).countBy({ name: 'repeat@example.com' }),
    ).toBe(1);
  });

  it('rotates the refresh token so the old one stops working', async () => {
    const first = await signInTokens('rotator');

    const second = await refresh(first.refreshToken).expect(200);

    expect(second.body.refreshToken).not.toBe(first.refreshToken);
    await refresh(first.refreshToken).expect(401);
    await refresh(second.body.refreshToken).expect(200);
  });

  it('signs out after 30 minutes without activity, even if refreshed', async () => {
    const tokens = await signInTokens('idle');
    const refreshed = await refresh(tokens.refreshToken).expect(200);
    // Refreshing is not activity, so the session still runs out.
    await idleFor(await sessionOf(refreshed.body.refreshToken), 31);

    await refresh(refreshed.body.refreshToken).expect(401);
    await h
      .http()
      .get('/api/v1/auth/me')
      .set(bearer(refreshed.body.accessToken))
      .expect(401);
  });

  it('keeps an active session alive', async () => {
    const tokens = await signInTokens('active');
    const session = await sessionOf(tokens.refreshToken);
    await idleFor(session, 25);

    await h
      .http()
      .get('/api/v1/auth/me')
      .set(bearer(tokens.accessToken))
      .expect(200);

    const touched = await h.db
      .getRepository(Session)
      .findOneByOrFail({ id: session.id });
    expect(Date.now() - touched.lastActivityAt.getTime()).toBeLessThan(60_000);
    await refresh(tokens.refreshToken).expect(200);
  });

  it('signs out and rejects the old tokens', async () => {
    const tokens = await signInTokens('bob');
    await h
      .http()
      .post('/api/v1/auth/logout')
      .set(bearer(tokens.accessToken))
      .expect(204);
    await h
      .http()
      .get('/api/v1/auth/me')
      .set(bearer(tokens.accessToken))
      .expect(401);
    await refresh(tokens.refreshToken).expect(401);
  });

  it('rejects a tampered access token', async () => {
    const { accessToken } = await signInTokens('tamper');
    await h
      .http()
      .get('/api/v1/auth/me')
      .set(bearer(`${accessToken}x`))
      .expect(401);
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
});
