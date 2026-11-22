import { IsInt, Min } from 'class-validator';
import { defineConfig, requireThat, type ConfigOf } from './define-config.js';

class PlansEnv {
  /** Requests per minute per API key on the standard plan (NFR 4.5). */
  @IsInt()
  @Min(1)
  PLAN_STANDARD_RATE_LIMIT: number;

  /** Requests per minute per API key on the extended plan. */
  @IsInt()
  @Min(1)
  PLAN_EXTENDED_RATE_LIMIT: number;
}

export const plansConfig = defineConfig('plans', PlansEnv, (env) => {
  requireThat(
    env.PLAN_EXTENDED_RATE_LIMIT >= env.PLAN_STANDARD_RATE_LIMIT,
    'PLAN_EXTENDED_RATE_LIMIT must be at least PLAN_STANDARD_RATE_LIMIT.',
  );
  return {
    standardRateLimit: env.PLAN_STANDARD_RATE_LIMIT,
    extendedRateLimit: env.PLAN_EXTENDED_RATE_LIMIT,
  };
});

export type PlansConfig = ConfigOf<typeof plansConfig>;
