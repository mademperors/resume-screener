import 'reflect-metadata';
import { validateEnv } from './env.validation.js';

const required = {
  DATABASE_URL: 'postgres://localhost/db',
  JWT_SECRET: 'x'.repeat(32),
  GOOGLE_CLIENT_ID: 'client-id',
  S3_ACCESS_KEY_ID: 'access-key',
  S3_SECRET_ACCESS_KEY: 'secret-key',
  REDIS_URL: 'redis://localhost:6379',
};

describe('validateEnv', () => {
  it('applies defaults', () => {
    const env = validateEnv(required);
    expect(env.PORT).toBe(3000);
    expect(env.SESSION_IDLE_TIMEOUT_MINUTES).toBe(30);
    expect(env.DB_RUN_MIGRATIONS).toBe('true');
    expect(env.S3_BUCKET).toBe('resumes');
    expect(env.RESUME_DOWNLOAD_URL_TTL_SECONDS).toBe(300);
  });

  it('converts numeric strings from the environment', () => {
    const env = validateEnv({
      ...required,
      PORT: '8080',
      SESSION_IDLE_TIMEOUT_MINUTES: '45',
    });
    expect(env.PORT).toBe(8080);
    expect(env.SESSION_IDLE_TIMEOUT_MINUTES).toBe(45);
  });

  it('rejects a missing secret or a short JWT secret', () => {
    expect(() => validateEnv({ ...required, JWT_SECRET: 'short' })).toThrow(
      /JWT_SECRET/,
    );
    expect(() =>
      validateEnv({ DATABASE_URL: 'x', JWT_SECRET: 'x'.repeat(32) }),
    ).toThrow(/GOOGLE_CLIENT_ID/);
  });
});

describe('validateEnv with empty values', () => {
  it('treats empty optional values as unset', () => {
    const env = validateEnv({
      ...required,
      S3_PUBLIC_ENDPOINT: '',
      S3_SERVER_SIDE_ENCRYPTION: '',
      CORS_ORIGINS: '',
    });
    expect(env.S3_PUBLIC_ENDPOINT).toBeUndefined();
    expect(env.S3_SERVER_SIDE_ENCRYPTION).toBeUndefined();
  });

  it('still requires required values', () => {
    expect(() => validateEnv({ ...required, S3_ACCESS_KEY_ID: '' })).toThrow(
      /S3_ACCESS_KEY_ID/,
    );
  });
});

describe('validateEnv for the Gemini model', () => {
  it('does not need a Gemini key while the mock model is used', () => {
    const env = validateEnv(required);
    expect(env.SCREENING_MODEL).toBe('mock');
    expect(env.GEMINI_API_KEY).toBeUndefined();
    expect(env.GEMINI_MODEL).toBe('gemini-decision-1');
    expect(env.GEMINI_TIMEOUT_MS).toBe(15_000);
  });

  it('requires the key once SCREENING_MODEL=gemini', () => {
    expect(() =>
      validateEnv({ ...required, SCREENING_MODEL: 'gemini' }),
    ).toThrow(/GEMINI_API_KEY/);
    expect(() =>
      validateEnv({
        ...required,
        SCREENING_MODEL: 'gemini',
        GEMINI_API_KEY: '',
      }),
    ).toThrow(/GEMINI_API_KEY/);
    expect(
      validateEnv({
        ...required,
        SCREENING_MODEL: 'gemini',
        GEMINI_API_KEY: 'k',
      }).GEMINI_API_KEY,
    ).toBe('k');
  });
});
