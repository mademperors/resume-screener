import { z } from 'zod';
import { defineConfig, envVar, type ConfigOf } from './define-config.js';

/** Requests per minute per API key on each plan (NFR 4.5). */
export const plansConfig = defineConfig(
  'plans',
  z
    .object({
      PLAN_STANDARD_RATE_LIMIT: envVar.int().min(1),
      PLAN_EXTENDED_RATE_LIMIT: envVar.int().min(1),
    })
    .refine(
      (env) => env.PLAN_EXTENDED_RATE_LIMIT >= env.PLAN_STANDARD_RATE_LIMIT,
      {
        path: ['PLAN_EXTENDED_RATE_LIMIT'],
        message:
          'PLAN_EXTENDED_RATE_LIMIT must be at least PLAN_STANDARD_RATE_LIMIT',
      },
    ),
  (env) => ({
    standardRateLimit: env.PLAN_STANDARD_RATE_LIMIT,
    extendedRateLimit: env.PLAN_EXTENDED_RATE_LIMIT,
  }),
);

export type PlansConfig = ConfigOf<typeof plansConfig>;
