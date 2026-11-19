import type { CompanyPlansService } from '../companies/company-plans.service.js';
import {
  ExecutionContext,
  ForbiddenException,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { ApiKeysService } from '../api-keys/api-keys.service.js';
import { IS_PUBLIC_KEY, SESSION_ONLY_KEY } from '../common/decorators.js';
import type { AuthenticatedRequest } from '../common/principal.js';
import { AuthGuard } from './auth.guard.js';
import type { AuthService } from './auth.service.js';

function contextFor(
  headers: Record<string, string>,
  metadata: Record<string, boolean> = {},
) {
  const request = {
    header: (name: string) => headers[name.toLowerCase()],
  } as AuthenticatedRequest;
  const handler = () => undefined;
  Object.entries(metadata).forEach(([key, value]) =>
    Reflect.defineMetadata(key, value, handler),
  );
  const context = {
    getHandler: () => handler,
    getClass: () => class {},
    switchToHttp: () => ({ getRequest: () => request }),
  } as unknown as ExecutionContext;
  return { context, request };
}

describe('AuthGuard', () => {
  const auth = {
    verifyAccessToken: vi.fn(),
    touchSession: vi.fn(),
  };
  const apiKeys = { verify: vi.fn() };
  const guard = new AuthGuard(
    new Reflector(),
    auth as unknown as AuthService,
    apiKeys as unknown as ApiKeysService,
    { rateLimitFor: () => 500 } as unknown as CompanyPlansService,
  );

  beforeEach(() => vi.resetAllMocks());

  it('lets public routes through without credentials', async () => {
    const { context } = contextFor({}, { [IS_PUBLIC_KEY]: true });
    await expect(guard.canActivate(context)).resolves.toBe(true);
  });

  it('returns 401 when no credentials are sent', async () => {
    const { context } = contextFor({});
    await expect(guard.canActivate(context)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it('authenticates a valid API key in the company context', async () => {
    apiKeys.verify.mockResolvedValue({
      id: 'key-1',
      companyId: 'company-1',
      company: { plan: 'extended', customRateLimitPerMinute: null },
    });
    const { context, request } = contextFor({ 'x-api-key': 'rsk_x' });

    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(request.principal).toEqual({
      kind: 'apiKey',
      apiKeyId: 'key-1',
      companyId: 'company-1',
      rateLimitPerMinute: 500,
    });
  });

  it('returns 401 for an invalid or revoked API key', async () => {
    apiKeys.verify.mockResolvedValue(null);
    const { context } = contextFor({ 'x-api-key': 'rsk_bad' });
    await expect(guard.canActivate(context)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it('returns 403 when an API key is used on a session-only route', async () => {
    const { context } = contextFor(
      { 'x-api-key': 'rsk_x' },
      { [SESSION_ONLY_KEY]: true },
    );
    await expect(guard.canActivate(context)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    expect(apiKeys.verify).not.toHaveBeenCalled();
  });

  it('authenticates a bearer token with an active session', async () => {
    auth.verifyAccessToken.mockResolvedValue({
      sub: 'user-1',
      cid: 'company-1',
      sid: 'session-1',
    });
    auth.touchSession.mockResolvedValue(true);
    const { context, request } = contextFor({ authorization: 'Bearer token' });

    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(auth.verifyAccessToken).toHaveBeenCalledWith('token');
    expect(request.principal).toEqual({
      kind: 'user',
      userId: 'user-1',
      companyId: 'company-1',
      sessionId: 'session-1',
    });
  });

  it('returns 401 when the session is revoked or idle', async () => {
    auth.verifyAccessToken.mockResolvedValue({
      sub: 'user-1',
      cid: 'company-1',
      sid: 'session-1',
    });
    auth.touchSession.mockResolvedValue(false);
    const { context } = contextFor({ authorization: 'Bearer token' });

    await expect(guard.canActivate(context)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });
});
