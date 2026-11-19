import 'reflect-metadata';
import { validateEnv } from './env.validation.js';

const required = {
  DATABASE_URL: 'postgres://localhost/db',
  JWT_SECRET: 'x'.repeat(32),
  GOOGLE_CLIENT_ID: 'client-id',
};

describe('validateEnv', () => {
  it('applies defaults', () => {
    const env = validateEnv(required);
    expect(env.PORT).toBe(3000);
    expect(env.SESSION_IDLE_TIMEOUT_MINUTES).toBe(30);
    expect(env.DB_RUN_MIGRATIONS).toBe('true');
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
