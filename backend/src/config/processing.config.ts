import { z } from 'zod';
import { defineConfig, envVar, type ConfigOf } from './define-config.js';

/** Background workers and the sweeper that requeues stuck or failed resumes. */
export const processingConfig = defineConfig(
  'processing',
  z.object({
    /** Resumes processed in parallel by one worker process. */
    WORKER_CONCURRENCY: envVar.int().min(1).max(100),
    /** Resumes sent to the screening model per second, across all workers. */
    SCREENING_RATE_LIMIT_PER_SECOND: envVar.int().min(1).max(1000),
    /** How often stuck and failed resumes are checked. */
    SWEEP_INTERVAL_SECONDS: envVar.int().min(5),
    /** Queued or Processing longer than this counts as stuck and is queued again. */
    STALE_RESUME_MINUTES: envVar.int().min(1),
    /** Retry resumes that failed for a temporary reason after this long; 0 turns it off. */
    FAILED_RESUME_RETRY_AFTER_MINUTES: envVar.int().min(0),
    /** Automatic retries per failed resume. */
    FAILED_RESUME_MAX_AUTO_RETRIES: envVar.int().min(0),
  }),
  (env) => ({
    concurrency: env.WORKER_CONCURRENCY,
    screeningRatePerSecond: env.SCREENING_RATE_LIMIT_PER_SECOND,
    sweepIntervalMs: env.SWEEP_INTERVAL_SECONDS * 1000,
    staleAfterMs: env.STALE_RESUME_MINUTES * 60_000,
    failedRetryAfterMs: env.FAILED_RESUME_RETRY_AFTER_MINUTES * 60_000,
    maxAutoRetries: env.FAILED_RESUME_MAX_AUTO_RETRIES,
  }),
);

export type ProcessingConfig = ConfigOf<typeof processingConfig>;
