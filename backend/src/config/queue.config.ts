import { IsInt, IsUrl, Max, Min } from 'class-validator';
import { defineConfig, type ConfigOf } from './define-config.js';

class QueueEnv {
  /** e.g. redis://localhost:6379; rediss:// for TLS. */
  @IsUrl({ protocols: ['redis', 'rediss'], require_tld: false })
  REDIS_URL: string;

  /** Tries per resume before it is marked "Processing failed". */
  @IsInt()
  @Min(1)
  @Max(20)
  PROCESSING_MAX_ATTEMPTS: number;

  /** First retry delay; each next one doubles. */
  @IsInt()
  @Min(100)
  PROCESSING_BACKOFF_MS: number;
}

/** The processing queue (BullMQ on Valkey), shared by the API and workers. */
export const queueConfig = defineConfig('queue', QueueEnv, (env) => ({
  redisUrl: env.REDIS_URL,
  maxAttempts: env.PROCESSING_MAX_ATTEMPTS,
  backoffMs: env.PROCESSING_BACKOFF_MS,
}));

export type QueueConfig = ConfigOf<typeof queueConfig>;
