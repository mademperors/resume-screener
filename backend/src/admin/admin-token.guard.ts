import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Request } from 'express';
import { safeEqual } from '../common/crypto.js';
import type { EnvironmentVariables } from '../config/env.validation.js';

export const ADMIN_TOKEN_HEADER = 'x-admin-token';

/**
 * Protects the admin API, used by the platform operator rather than by
 * companies. Off unless ADMIN_API_TOKEN is set; the token is compared in
 * constant time.
 */
@Injectable()
export class AdminTokenGuard implements CanActivate {
  private readonly token: string | undefined;

  constructor(config: ConfigService<EnvironmentVariables, true>) {
    this.token = config.get('ADMIN_API_TOKEN', { infer: true });
  }

  canActivate(context: ExecutionContext): boolean {
    if (!this.token) {
      throw new ForbiddenException(
        'The admin API is turned off. Set ADMIN_API_TOKEN to use it.',
      );
    }
    const sent = context
      .switchToHttp()
      .getRequest<Request>()
      .header(ADMIN_TOKEN_HEADER);
    if (!sent || !safeEqual(sent, this.token)) {
      throw new UnauthorizedException(
        'A valid X-Admin-Token header is required.',
      );
    }
    return true;
  }
}
