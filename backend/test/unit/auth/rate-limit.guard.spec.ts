import {
  ExecutionContext,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { RateLimitGuard } from '@src/auth/rate-limit.guard.js';
import { RateLimiter, type RateWindowState } from '@src/auth/rate-limiter.js';
import type { Principal } from '@src/common/principal.js';

/**
 * The guard's own logic: who is limited, headers, 429 and failing open.
 * Counting itself (RedisRateLimiter) is covered against a real Valkey in
 * test/integration/rate-limiter.spec.ts.
 */
class CountingLimiter extends RateLimiter {
  readonly counts = new Map<string, number>();
  down = false;

  async hit(key: string): Promise<RateWindowState> {
    if (this.down) {
      throw new Error('connection refused');
    }
    const count = (this.counts.get(key) ?? 0) + 1;
    this.counts.set(key, count);
    return { count, resetInMs: 42_500 };
  }
}

function contextFor(principal: Principal | undefined) {
  const headers: Record<string, unknown> = {};
  const context = {
    switchToHttp: () => ({
      getRequest: () => ({ principal }),
      getResponse: () => ({
        setHeader: (name: string, value: unknown) => (headers[name] = value),
      }),
    }),
  } as unknown as ExecutionContext;
  return { context, headers };
}

const apiKey = (id: string, limit: number): Principal => ({
  kind: 'apiKey',
  apiKeyId: id,
  companyId: 'company-1',
  rateLimitPerMinute: limit,
});

describe('RateLimitGuard', () => {
  let limiter: CountingLimiter;
  let guard: RateLimitGuard;

  beforeEach(() => {
    limiter = new CountingLimiter();
    guard = new RateLimitGuard(limiter);
  });

  it('lets requests up to the limit through and reports what is left', async () => {
    const { context, headers } = contextFor(apiKey('key-1', 3));
    await guard.canActivate(context);
    expect(await guard.canActivate(context)).toBe(true);
    expect(headers).toMatchObject({
      'X-RateLimit-Limit': 3,
      'X-RateLimit-Remaining': 1,
      'X-RateLimit-Reset': 43,
    });
  });

  it('answers 429 with Retry-After above the limit', async () => {
    for (let i = 0; i < 3; i++) {
      await guard.canActivate(contextFor(apiKey('key-1', 3)).context);
    }
    const { context, headers } = contextFor(apiKey('key-1', 3));

    const error = await guard.canActivate(context).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(HttpException);
    expect((error as HttpException).getStatus()).toBe(
      HttpStatus.TOO_MANY_REQUESTS,
    );
    expect((error as HttpException).message).toMatch(
      /limited to 3 requests per minute/,
    );
    expect(headers).toMatchObject({
      'Retry-After': 43,
      'X-RateLimit-Remaining': 0,
    });
  });

  it('counts per API key', async () => {
    await guard.canActivate(contextFor(apiKey('key-1', 1)).context);
    await guard.canActivate(contextFor(apiKey('key-2', 1)).context);
    expect([...limiter.counts.keys()]).toEqual([
      'api-key:key-1',
      'api-key:key-2',
    ]);
  });

  it('lets requests through when the counter store is down', async () => {
    vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    limiter.down = true;
    expect(
      await guard.canActivate(contextFor(apiKey('key-1', 1)).context),
    ).toBe(true);
  });

  it('does not limit signed-in users or anonymous requests', async () => {
    const user: Principal = {
      kind: 'user',
      userId: 'u',
      companyId: 'c',
      sessionId: 's',
    };
    expect(await guard.canActivate(contextFor(user).context)).toBe(true);
    expect(await guard.canActivate(contextFor(undefined).context)).toBe(true);
    expect(limiter.counts.size).toBe(0);
  });
});
