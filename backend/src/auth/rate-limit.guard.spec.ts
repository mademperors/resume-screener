import { ExecutionContext, HttpException, HttpStatus } from '@nestjs/common';
import type { Principal } from '../common/principal.js';
import { RateLimitGuard } from './rate-limit.guard.js';

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

describe('RateLimitGuard', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('allows 200 requests per minute and answers 429 on the 201st', () => {
    const guard = new RateLimitGuard();
    for (let i = 0; i < 200; i++) {
      expect(guard.canActivate(contextFor(apiKey('key-1')).context)).toBe(true);
    }

    const { context, headers } = contextFor(apiKey('key-1'));
    let error: unknown;
    try {
      guard.canActivate(context);
    } catch (caught) {
      error = caught;
    }

    expect(error).toBeInstanceOf(HttpException);
    expect((error as HttpException).getStatus()).toBe(
      HttpStatus.TOO_MANY_REQUESTS,
    );
    expect(headers['Retry-After']).toBeGreaterThan(0);
    expect(headers['X-RateLimit-Remaining']).toBe(0);
  });

  it('starts a new window after a minute', () => {
    const guard = new RateLimitGuard();
    for (let i = 0; i < 3; i++)
      guard.canActivate(contextFor(apiKey('key-1', 3)).context);
    expect(() =>
      guard.canActivate(contextFor(apiKey('key-1', 3)).context),
    ).toThrow(HttpException);

    vi.advanceTimersByTime(60_000);

    expect(guard.canActivate(contextFor(apiKey('key-1', 3)).context)).toBe(
      true,
    );
  });

  it('counts each key separately and uses its plan limit', () => {
    const guard = new RateLimitGuard();
    for (let i = 0; i < 2; i++)
      guard.canActivate(contextFor(apiKey('key-1', 2)).context);

    expect(guard.canActivate(contextFor(apiKey('key-2', 2)).context)).toBe(
      true,
    );
  });

  it('does not limit signed-in users', () => {
    const guard = new RateLimitGuard();
    const user: Principal = {
      kind: 'user',
      userId: 'u',
      companyId: 'c',
      sessionId: 's',
    };
    for (let i = 0; i < 500; i++) {
      expect(guard.canActivate(contextFor(user).context)).toBe(true);
    }
  });
});
