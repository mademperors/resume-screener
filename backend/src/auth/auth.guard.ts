import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ApiKeysService } from '../api-keys/api-keys.service.js';
import { IS_PUBLIC_KEY, SESSION_ONLY_KEY } from '../common/decorators.js';
import type { AuthenticatedRequest } from '../common/principal.js';
import { CompanyPlansService } from '../companies/company-plans.service.js';
import { AuthService } from './auth.service.js';

export const API_KEY_HEADER = 'x-api-key';

/**
 * Global guard. Authenticates every route that isn't @Public() with either a
 * session access token (`Authorization: Bearer`) or an API key (`X-API-Key`).
 */
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly auth: AuthService,
    private readonly apiKeys: ApiKeysService,
    private readonly plans: CompanyPlansService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const targets = [context.getHandler(), context.getClass()];
    if (this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, targets)) {
      return true;
    }
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();

    const apiKey = request.header(API_KEY_HEADER);
    if (apiKey !== undefined) {
      if (
        this.reflector.getAllAndOverride<boolean>(SESSION_ONLY_KEY, targets)
      ) {
        throw new ForbiddenException(
          'This action is available only in the web app, not with an API key.',
        );
      }
      const key = await this.apiKeys.verify(apiKey);
      if (!key) {
        throw new UnauthorizedException(
          'The API key is invalid or has been revoked.',
        );
      }
      request.principal = {
        kind: 'apiKey',
        apiKeyId: key.id,
        companyId: key.companyId,
        rateLimitPerMinute: this.plans.rateLimitFor(key.company),
      };
      return true;
    }

    const authorization = request.header('authorization');
    if (authorization?.startsWith('Bearer ')) {
      const payload = await this.auth.verifyAccessToken(
        authorization.slice('Bearer '.length),
      );
      if (!(await this.auth.touchSession(payload.sid))) {
        throw new UnauthorizedException(
          'Your session has expired. Please sign in again.',
        );
      }
      request.principal = {
        kind: 'user',
        userId: payload.sub,
        companyId: payload.cid,
        sessionId: payload.sid,
      };
      return true;
    }

    throw new UnauthorizedException(
      'Authentication required. Sign in with Google or send an API key in the X-API-Key header.',
    );
  }
}
