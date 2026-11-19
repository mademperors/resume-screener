import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types.js';
import {
  GoogleTokenVerifier,
  type GoogleIdentity,
} from './../src/auth/google-token.verifier.js';
import { configureApp } from './../src/setup.js';

// Needs a real Postgres: `docker compose up -d` and DATABASE_URL set (see .env.example).
const hasDatabase = Boolean(process.env.DATABASE_URL);

describe.skipIf(!hasDatabase)('API v1 (e2e)', () => {
  let app: INestApplication<App>;
  const subject = `e2e-${Date.now()}`;

  beforeAll(async () => {
    // Imported lazily: loading AppModule validates env, which fails without a database.
    const { AppModule } = await import('./../src/app.module.js');
    const fakeGoogle = {
      verify: async (idToken: string): Promise<GoogleIdentity> => ({
        subject: `${subject}-${idToken}`,
        email: `${idToken}@example.com`,
        name: idToken,
        avatarUrl: null,
        hostedDomain: null,
      }),
    };
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(GoogleTokenVerifier)
      .useValue(fakeGoogle)
      .compile();
    app = moduleRef.createNestApplication();
    configureApp(app);
    await app.init();
  });

  afterAll(async () => {
    await app?.close();
  });

  const signIn = async (who: string) => {
    const response = await request(app.getHttpServer())
      .post('/api/v1/auth/google')
      .send({ idToken: who })
      .expect(200);
    return response.body.accessToken as string;
  };

  it('serves health without auth', () =>
    request(app.getHttpServer())
      .get('/api/v1/health')
      .expect(200, { status: 'ok' }));

  it('returns 401 without credentials', () =>
    request(app.getHttpServer()).get('/api/v1/jobs').expect(401));

  it('returns 401 for an unknown API key', () =>
    request(app.getHttpServer())
      .get('/api/v1/jobs')
      .set('X-API-Key', `rsk_000000000000_${'a'.repeat(43)}`)
      .expect(401));

  it('signs in with Google and returns the profile', async () => {
    const token = await signIn('alice');
    const me = await request(app.getHttpServer())
      .get('/api/v1/auth/me')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(me.body.email).toBe('alice@example.com');
    expect(me.body.company.apiRateLimitPerMinute).toBe(200);
  });

  it('signs out and rejects the old access token', async () => {
    const token = await signIn('bob');
    const http = request(app.getHttpServer());
    await http
      .post('/api/v1/auth/logout')
      .set('Authorization', `Bearer ${token}`)
      .expect(204);
    await request(app.getHttpServer())
      .get('/api/v1/auth/me')
      .set('Authorization', `Bearer ${token}`)
      .expect(401);
  });

  it('creates, uses and revokes an API key', async () => {
    const token = await signIn('carol');
    const created = await request(app.getHttpServer())
      .post('/api/v1/api-keys')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'ATS' })
      .expect(201);
    const key = created.body.key as string;

    const listed = await request(app.getHttpServer())
      .get('/api/v1/api-keys')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(JSON.stringify(listed.body)).not.toContain(key);

    // Authenticated; endpoint itself is not implemented yet.
    const jobs = await request(app.getHttpServer())
      .get('/api/v1/jobs')
      .set('X-API-Key', key)
      .expect(501);
    expect(jobs.headers['x-ratelimit-limit']).toBe('200');

    await request(app.getHttpServer())
      .get('/api/v1/api-keys')
      .set('X-API-Key', key)
      .expect(403);

    await request(app.getHttpServer())
      .delete(`/api/v1/api-keys/${created.body.id}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    await request(app.getHttpServer())
      .get('/api/v1/jobs')
      .set('X-API-Key', key)
      .expect(401);
  });

  it("forbids revoking another company's API key", async () => {
    const owner = await signIn('dave');
    const created = await request(app.getHttpServer())
      .post('/api/v1/api-keys')
      .set('Authorization', `Bearer ${owner}`)
      .send({ name: 'ATS' })
      .expect(201);

    const stranger = await signIn('erin');
    await request(app.getHttpServer())
      .delete(`/api/v1/api-keys/${created.body.id}`)
      .set('Authorization', `Bearer ${stranger}`)
      .expect(403);
  });

  it('validates request bodies', async () => {
    const token = await signIn('frank');
    await request(app.getHttpServer())
      .post('/api/v1/jobs')
      .set('Authorization', `Bearer ${token}`)
      .send({ title: '', minExperienceYears: -1 })
      .expect(400);
  });
});
