import {
  createParamDecorator,
  ExecutionContext,
  SetMetadata,
  UnauthorizedException,
} from '@nestjs/common';
import type {
  AuthenticatedRequest,
  Principal,
  UserPrincipal,
} from './principal.js';

export const IS_PUBLIC_KEY = 'auth:isPublic';
export const SESSION_ONLY_KEY = 'auth:sessionOnly';

/** Skips authentication for the route. */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);

/** Allows only signed-in users; API keys are rejected with 403. */
export const SessionOnly = () => SetMetadata(SESSION_ONLY_KEY, true);

function principalOf(ctx: ExecutionContext): Principal {
  const principal = ctx
    .switchToHttp()
    .getRequest<AuthenticatedRequest>().principal;
  if (!principal) {
    throw new UnauthorizedException('Authentication required.');
  }
  return principal;
}

export const CurrentPrincipal = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): Principal => principalOf(ctx),
);

/** Use together with @SessionOnly(). */
export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): UserPrincipal => {
    const principal = principalOf(ctx);
    if (principal.kind !== 'user') {
      throw new UnauthorizedException('This action requires signing in.');
    }
    return principal;
  },
);
