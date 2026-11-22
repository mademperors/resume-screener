import { z } from 'zod';
import { defineConfig, envVar, type ConfigOf } from './define-config.js';

export const retentionConfig = defineConfig(
  'retention',
  z.object({
    /** Candidate data is deleted this many days after its job is closed or deleted. */
    RETENTION_DAYS: envVar.int().min(1),
    /**
     * How often retention runs; it also retries deleting stored files, so
     * keep it well under 24 hours.
     */
    RETENTION_INTERVAL_MINUTES: envVar.int().min(1).max(720),
  }),
  (env) => ({
    retentionMs: env.RETENTION_DAYS * 86_400_000,
    intervalMs: env.RETENTION_INTERVAL_MINUTES * 60_000,
  }),
);

export type RetentionConfig = ConfigOf<typeof retentionConfig>;
