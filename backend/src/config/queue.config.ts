import { z } from 'zod';
import { defineConfig, envVar, type ConfigOf } from './define-config.js';

/** The processing queue (BullMQ on Valkey), shared by the API and workers. */
export const queueConfig = defineConfig(
  'queue',
  z.object({
    /** e.g. redis://localhost:6379; rediss:// for TLS. */
    REDIS_URL: envVar.url('redis', 'rediss'),
    /** Tries per resume before it is marked "Processing failed". */
    PROCESSING_MAX_ATTEMPTS: envVar.int().min(1).max(20),
    /** First retry delay; each next one doubles. */
    PROCESSING_BACKOFF_MS: envVar.int().min(100),
  }),
  (env) => ({
    redisUrl: env.REDIS_URL,
    maxAttempts: env.PROCESSING_MAX_ATTEMPTS,
    backoffMs: env.PROCESSING_BACKOFF_MS,
  }),
);

export type QueueConfig = ConfigOf<typeof queueConfig>;
