import { IsInt, Max, Min } from 'class-validator';
import { defineConfig, type ConfigOf } from './define-config.js';

class ProcessingEnv {
  /** Resumes processed in parallel by one worker process. */
  @IsInt()
  @Min(1)
  @Max(100)
  WORKER_CONCURRENCY: number;

  /** Resumes sent to the screening model per second, across all workers. */
  @IsInt()
  @Min(1)
  @Max(1000)
  SCREENING_RATE_LIMIT_PER_SECOND: number;

  /** How often stuck and failed resumes are checked. */
  @IsInt()
  @Min(5)
  SWEEP_INTERVAL_SECONDS: number;

  /** Queued or Processing longer than this counts as stuck and is queued again. */
  @IsInt()
  @Min(1)
  STALE_RESUME_MINUTES: number;

  /** Retry resumes that failed for a temporary reason after this long; 0 turns it off. */
  @IsInt()
  @Min(0)
  FAILED_RESUME_RETRY_AFTER_MINUTES: number;

  /** Automatic retries per failed resume. */
  @IsInt()
  @Min(0)
  FAILED_RESUME_MAX_AUTO_RETRIES: number;
}

/** Background workers and the sweeper that requeues stuck or failed resumes. */
export const processingConfig = defineConfig(
  'processing',
  ProcessingEnv,
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
