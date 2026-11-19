import {
  ExecutionContext,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import type { Redis } from 'ioredis';
import type { Principal } from '../common/principal.js';
import { RateLimitGuard } from './rate-limit.guard.js';

/** Enough of ioredis for the guard: MULTI with INCR and PEXPIRE. */
class FakeRedis {
  readonly counters = new Map<string, number>();
  down = false;

  multi() {
    let key = '';
    const chain = {
      incr: (k: string) => {
        key = k;
        return chain;
      },
      pexpire: () => chain,
      exec: async () => {
        if (this.down) {
          throw new Error('connection refused');
        }
        const value = (this.counters.get(key) ?? 0) + 1;
        this.counters.set(key, value);
        return [
          [null, value],
          [null, 1],
        ];
      },
    };
    return chain;
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

const apiKey = (id: string, limit = 200): Principal => ({
  kind: 'apiKey',
  apiKeyId: id,
  companyId: 'company-1',
  rateLimitPerMinute: limit,
});

function setup() {
  const redis = new FakeRedis();
  return { redis, guard: new RateLimitGuard(redis as unknown as Redis) };
}

describe('RateLimitGuard', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('allows 200 requests per minute and answers 429 on the 201st', async () => {
    const { guard } = setup();
    for (let i = 0; i < 200; i++) {
      expect(await guard.canActivate(contextFor(apiKey('key-1')).context)).toBe(
        true,
      );
    }

    const { context, headers } = contextFor(apiKey('key-1'));
    const error = await guard.canActivate(context).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(HttpException);
    expect((error as HttpException).getStatus()).toBe(
      HttpStatus.TOO_MANY_REQUESTS,
    );
    expect(headers['Retry-After']).toBeGreaterThan(0);
    expect(headers['X-RateLimit-Remaining']).toBe(0);
  });

  it('starts a new window after a minute', async () => {
    const { guard } = setup();
    for (let i = 0; i < 3; i++) {
      await guard.canActivate(contextFor(apiKey('key-1', 3)).context);
    }
    await expect(
      guard.canActivate(contextFor(apiKey('key-1', 3)).context),
    ).rejects.toThrow(HttpException);

    vi.advanceTimersByTime(60_000);

    expect(
      await guard.canActivate(contextFor(apiKey('key-1', 3)).context),
    ).toBe(true);
  });

  it('counts each key separately and uses its plan limit', async () => {
    const { guard } = setup();
    for (let i = 0; i < 2; i++) {
      await guard.canActivate(contextFor(apiKey('key-1', 2)).context);
    }
    expect(
      await guard.canActivate(contextFor(apiKey('key-2', 2)).context),
    ).toBe(true);
  });

  it('shares counters between API instances', async () => {
    const redis = new FakeRedis();
    const first = new RateLimitGuard(redis as unknown as Redis);
    const second = new RateLimitGuard(redis as unknown as Redis);
    await first.canActivate(contextFor(apiKey('key-1', 1)).context);
    await expect(
      second.canActivate(contextFor(apiKey('key-1', 1)).context),
    ).rejects.toThrow(HttpException);
  });

  it('lets requests through when Redis is down', async () => {
    vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    const { guard, redis } = setup();
    redis.down = true;
    expect(
      await guard.canActivate(contextFor(apiKey('key-1', 1)).context),
    ).toBe(true);
  });

  it('does not limit signed-in users', async () => {
    const { guard, redis } = setup();
    const user: Principal = {
      kind: 'user',
      userId: 'u',
      companyId: 'c',
      sessionId: 's',
    };
    for (let i = 0; i < 500; i++) {
      expect(await guard.canActivate(contextFor(user).context)).toBe(true);
    }
    expect(redis.counters.size).toBe(0);
  });
});
