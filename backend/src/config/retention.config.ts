import { IsInt, Max, Min } from 'class-validator';
import { defineConfig, type ConfigOf } from './define-config.js';

class RetentionEnv {
  /** Candidate data is deleted this many days after its job is closed or deleted. */
  @IsInt()
  @Min(1)
  RETENTION_DAYS: number;

  /**
   * How often retention runs; it also retries deleting stored files, so keep
   * it well under 24 hours.
   */
  @IsInt()
  @Min(1)
  @Max(720)
  RETENTION_INTERVAL_MINUTES: number;
}

export const retentionConfig = defineConfig(
  'retention',
  RetentionEnv,
  (env) => ({
    retentionMs: env.RETENTION_DAYS * 86_400_000,
    intervalMs: env.RETENTION_INTERVAL_MINUTES * 60_000,
  }),
);

export type RetentionConfig = ConfigOf<typeof retentionConfig>;
