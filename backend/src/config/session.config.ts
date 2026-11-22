import { z } from 'zod';
import { defineConfig, envVar, type ConfigOf } from './define-config.js';

/**
 * Session lifetimes: the API uses them to sign users out, the worker to
 * delete sessions that have ended.
 */
export const sessionConfig = defineConfig(
  'session',
  z
    .object({
      ACCESS_TOKEN_TTL_MINUTES: envVar.int().min(1),
      SESSION_IDLE_TIMEOUT_MINUTES: envVar.int().min(1),
      SESSION_MAX_AGE_HOURS: envVar.int().min(1),
    })
    .refine(
      (env) => env.ACCESS_TOKEN_TTL_MINUTES <= env.SESSION_IDLE_TIMEOUT_MINUTES,
      {
        path: ['ACCESS_TOKEN_TTL_MINUTES'],
        message:
          'ACCESS_TOKEN_TTL_MINUTES must not exceed SESSION_IDLE_TIMEOUT_MINUTES, or idle users stay signed in',
      },
    )
    .refine(
      (env) =>
        env.SESSION_IDLE_TIMEOUT_MINUTES <= env.SESSION_MAX_AGE_HOURS * 60,
      {
        path: ['SESSION_IDLE_TIMEOUT_MINUTES'],
        message:
          'SESSION_IDLE_TIMEOUT_MINUTES must not exceed SESSION_MAX_AGE_HOURS',
      },
    ),
  (env) => ({
    accessTokenTtlSeconds: env.ACCESS_TOKEN_TTL_MINUTES * 60,
    idleTimeoutMs: env.SESSION_IDLE_TIMEOUT_MINUTES * 60_000,
    maxAgeMs: env.SESSION_MAX_AGE_HOURS * 3_600_000,
  }),
);

export type SessionConfig = ConfigOf<typeof sessionConfig>;
