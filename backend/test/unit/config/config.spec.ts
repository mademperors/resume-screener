import 'reflect-metadata';
import { readFileSync } from 'node:fs';
import { parseEnv } from 'node:util';
import { adminConfig } from '@src/config/admin.config.js';
import { appConfig } from '@src/config/app.config.js';
import { authConfig } from '@src/config/auth.config.js';
import { databaseConfig } from '@src/config/database.config.js';
import { envFiles } from '@src/config/env-files.js';
import { plansConfig } from '@src/config/plans.config.js';
import { processingConfig } from '@src/config/processing.config.js';
import { queueConfig } from '@src/config/queue.config.js';
import { retentionConfig } from '@src/config/retention.config.js';
import { screeningConfig } from '@src/config/screening.config.js';
import { sessionConfig } from '@src/config/session.config.js';
import { storageConfig } from '@src/config/storage.config.js';

const DEFAULTS = parseEnv(readFileSync('.env.defaults', 'utf8'));

/** What a developer puts in .env (see .env.example). */
const SECRETS = {
  JWT_SECRET: 'x'.repeat(32),
  GOOGLE_CLIENT_ID: 'client-id',
  POSTGRES_PASSWORD: 'p@ss/word',
  S3_ACCESS_KEY_ID: 'access-key',
  S3_SECRET_ACCESS_KEY: 'secret-key',
};

const env = (overrides: Record<string, string> = {}) => ({
  ...DEFAULTS,
  ...SECRETS,
  ...overrides,
});

const ALL = [
  adminConfig,
  appConfig,
  authConfig,
  databaseConfig,
  plansConfig,
  processingConfig,
  queueConfig,
  retentionConfig,
  screeningConfig,
  sessionConfig,
  storageConfig,
];

describe('.env.defaults', () => {
  it('together with the secrets from .env.example is a valid configuration', () => {
    for (const config of ALL) {
      expect(() => config.load(env())).not.toThrow();
    }
  });

  it('holds no secrets', () => {
    for (const name of Object.keys(SECRETS)) {
      expect(DEFAULTS).not.toHaveProperty(name);
    }
    expect(DEFAULTS).not.toHaveProperty('GEMINI_API_KEY');
  });

  it('is the only env file tests read', () => {
    expect(envFiles('test')).toEqual(['.env.defaults']);
    expect(envFiles('production')).toEqual(['.env', '.env.defaults']);
  });
});

describe('config namespaces', () => {
  it('converts numbers, booleans and lists', () => {
    expect(
      appConfig.load(
        env({
          PORT: '8080',
          RUN_WORKER_IN_API: 'false',
          CORS_ORIGINS: 'http://localhost:5173, https://app.example.com,',
        }),
      ),
    ).toEqual({
      port: 8080,
      runWorkerInApi: false,
      corsOrigins: ['http://localhost:5173', 'https://app.example.com'],
    });
    expect(storageConfig.load(env()).forcePathStyle).toBe(true);
  });

  it('treats empty values as unset', () => {
    const storage = storageConfig.load(
      env({ S3_PUBLIC_ENDPOINT: '', S3_SERVER_SIDE_ENCRYPTION: '' }),
    );
    expect(storage.publicEndpoint).toBeUndefined();
    expect(storage.serverSideEncryption).toBeUndefined();
    expect(adminConfig.load(env({ ADMIN_API_TOKEN: '' })).token).toBeNull();
    expect(() => storageConfig.load(env({ S3_ACCESS_KEY_ID: '' }))).toThrow(
      /S3_ACCESS_KEY_ID/,
    );
  });

  it('builds the database URL from the POSTGRES_* parts, unless DATABASE_URL is set', () => {
    expect(databaseConfig.load(env()).url).toBe(
      'postgres://screener:p%40ss%2Fword@localhost:5432/screener',
    );
    expect(
      databaseConfig.load({
        DATABASE_URL: 'postgres://u:p@db:5432/x',
        DB_RUN_MIGRATIONS: 'false',
      }),
    ).toEqual({ url: 'postgres://u:p@db:5432/x', runMigrations: false });
    expect(() => databaseConfig.load(env({ POSTGRES_PASSWORD: '' }))).toThrow(
      /POSTGRES_PASSWORD/,
    );
  });

  it('rejects a missing secret or a short JWT secret', () => {
    expect(() => authConfig.load(env({ JWT_SECRET: 'short' }))).toThrow(
      /JWT_SECRET/,
    );
    expect(() => authConfig.load(env({ GOOGLE_CLIENT_ID: '' }))).toThrow(
      /GOOGLE_CLIENT_ID/,
    );
  });

  it('needs the Gemini key only for the Gemini model', () => {
    expect(screeningConfig.load(env())).toEqual({ model: 'mock' });
    expect(() =>
      screeningConfig.load(env({ SCREENING_MODEL: 'gemini' })),
    ).toThrow(/GEMINI_API_KEY/);
    expect(
      screeningConfig.load(
        env({ SCREENING_MODEL: 'gemini', GEMINI_API_KEY: 'k' }),
      ),
    ).toEqual({
      model: 'gemini',
      gemini: {
        apiKey: 'k',
        apiUrl: DEFAULTS.GEMINI_API_URL,
        model: 'gemini-decision-1',
        timeoutMs: 15_000,
      },
    });
  });

  it('rejects settings that contradict each other', () => {
    expect(() =>
      sessionConfig.load(
        env({
          ACCESS_TOKEN_TTL_MINUTES: '60',
          SESSION_IDLE_TIMEOUT_MINUTES: '30',
        }),
      ),
    ).toThrow(/ACCESS_TOKEN_TTL_MINUTES/);
    expect(() =>
      sessionConfig.load(
        env({
          SESSION_IDLE_TIMEOUT_MINUTES: '120',
          SESSION_MAX_AGE_HOURS: '1',
        }),
      ),
    ).toThrow(/SESSION_MAX_AGE_HOURS/);
    expect(() =>
      plansConfig.load(
        env({
          PLAN_STANDARD_RATE_LIMIT: '500',
          PLAN_EXTENDED_RATE_LIMIT: '100',
        }),
      ),
    ).toThrow(/PLAN_EXTENDED_RATE_LIMIT/);
  });

  it('rejects URLs with the wrong protocol', () => {
    expect(() => queueConfig.load(env({ REDIS_URL: 'http://x:6379' }))).toThrow(
      /REDIS_URL/,
    );
    expect(() =>
      storageConfig.load(env({ S3_ENDPOINT: 'ftp://storage' })),
    ).toThrow(/S3_ENDPOINT/);
  });

  it('converts units once, so services get milliseconds and seconds', () => {
    expect(sessionConfig.load(env())).toEqual({
      accessTokenTtlSeconds: 900,
      idleTimeoutMs: 30 * 60_000,
      maxAgeMs: 168 * 3_600_000,
    });
    expect(retentionConfig.load(env()).retentionMs).toBe(365 * 86_400_000);
  });
});
