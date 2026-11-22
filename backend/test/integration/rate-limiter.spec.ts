import { randomUUID } from 'node:crypto';
import { RateLimiter, RedisRateLimiter } from '@src/auth/rate-limiter.js';
import { createRedisClient } from '@src/queue/redis.module.js';
import { testInfrastructure } from '../support/test-env.js';

// Fixed one-minute windows in a real Valkey.
describe('RedisRateLimiter', () => {
  const redis = createRedisClient(testInfrastructure.redisUrl);
  const limiter = new RedisRateLimiter(redis);
  const WINDOW = RateLimiter.WINDOW_MS;
  // The start of some window, so tests don't depend on the clock.
  const windowStart = Math.floor(Date.now() / WINDOW) * WINDOW;
  const key = () => `test:${randomUUID()}`;

  afterAll(() => redis.quit());

  it('counts requests within a window and says when it resets', async () => {
    const k = key();
    expect(await limiter.hit(k, windowStart + 1_000)).toEqual({
      count: 1,
      resetInMs: WINDOW - 1_000,
    });
    expect((await limiter.hit(k, windowStart + 59_000)).count).toBe(2);
  });

  it('starts from zero in the next window', async () => {
    const k = key();
    await limiter.hit(k, windowStart);
    await limiter.hit(k, windowStart);
    expect((await limiter.hit(k, windowStart + WINDOW)).count).toBe(1);
  });

  it('keeps keys apart and shares counters between instances', async () => {
    const k = key();
    const other = new RedisRateLimiter(redis);
    await limiter.hit(k, windowStart);
    expect((await other.hit(k, windowStart)).count).toBe(2);
    expect((await limiter.hit(key(), windowStart)).count).toBe(1);
  });

  it('lets the counters expire', async () => {
    const k = key();
    await limiter.hit(k, windowStart);
    const ttl = await redis.pttl(`ratelimit:${k}:${windowStart / WINDOW}`);
    expect(ttl).toBeGreaterThan(0);
    expect(ttl).toBeLessThanOrEqual(2 * WINDOW);
  });
});
