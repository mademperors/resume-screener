import { Inject, Injectable } from '@nestjs/common';
import type { Redis } from 'ioredis';
import { REDIS_CONNECTION } from '../queue/redis.module.js';

export interface RateWindowState {
  /** Requests counted in the current window, this one included. */
  count: number;
  /** Until the current window ends. */
  resetInMs: number;
}

/**
 * Counts requests per key in fixed one-minute windows. Inject this abstract
 * class; the Redis implementation shares counters between API instances.
 */
export abstract class RateLimiter {
  static readonly WINDOW_MS = 60_000;

  /** Counts one request for the key. Rejects when the store is unavailable. */
  abstract hit(key: string, now?: number): Promise<RateWindowState>;
}

@Injectable()
export class RedisRateLimiter extends RateLimiter {
  constructor(@Inject(REDIS_CONNECTION) private readonly redis: Redis) {
    super();
  }

  async hit(key: string, now = Date.now()): Promise<RateWindowState> {
    const windowMs = RateLimiter.WINDOW_MS;
    const window = Math.floor(now / windowMs);
    const redisKey = `ratelimit:${key}:${window}`;
    const results = await this.redis
      .multi()
      .incr(redisKey)
      .pexpire(redisKey, windowMs * 2)
      .exec();
    const [error, value] = results?.[0] ?? [new Error('No reply'), null];
    if (error) {
      throw error;
    }
    return { count: Number(value), resetInMs: (window + 1) * windowMs - now };
  }
}
