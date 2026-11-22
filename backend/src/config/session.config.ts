import { IsInt, Min } from 'class-validator';
import { defineConfig, requireThat, type ConfigOf } from './define-config.js';

class SessionEnv {
  @IsInt()
  @Min(1)
  ACCESS_TOKEN_TTL_MINUTES: number;

  @IsInt()
  @Min(1)
  SESSION_IDLE_TIMEOUT_MINUTES: number;

  @IsInt()
  @Min(1)
  SESSION_MAX_AGE_HOURS: number;
}

/**
 * Session lifetimes, without secrets: the API uses them to sign users out,
 * the worker to delete sessions that have ended.
 */
export const sessionConfig = defineConfig('session', SessionEnv, (env) => {
  requireThat(
    env.ACCESS_TOKEN_TTL_MINUTES <= env.SESSION_IDLE_TIMEOUT_MINUTES,
    'ACCESS_TOKEN_TTL_MINUTES must not exceed SESSION_IDLE_TIMEOUT_MINUTES, or idle users stay signed in.',
  );
  requireThat(
    env.SESSION_IDLE_TIMEOUT_MINUTES <= env.SESSION_MAX_AGE_HOURS * 60,
    'SESSION_IDLE_TIMEOUT_MINUTES must not exceed SESSION_MAX_AGE_HOURS.',
  );
  return {
    accessTokenTtlSeconds: env.ACCESS_TOKEN_TTL_MINUTES * 60,
    idleTimeoutMs: env.SESSION_IDLE_TIMEOUT_MINUTES * 60_000,
    maxAgeMs: env.SESSION_MAX_AGE_HOURS * 3_600_000,
  };
});

export type SessionConfig = ConfigOf<typeof sessionConfig>;
