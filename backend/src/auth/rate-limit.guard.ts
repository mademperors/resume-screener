import {
  CanActivate,
  ExecutionContext,
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
} from '@nestjs/common';
import type { Response } from 'express';
import type { AuthenticatedRequest } from '../common/principal.js';
import { RateLimiter, type RateWindowState } from './rate-limiter.js';

/**
 * Global guard, runs after AuthGuard. Limits each API key to its company's
 * requests-per-minute quota and answers 429 above it. If the counter store
 * is unreachable, requests are let through rather than blocking every
 * integration.
 */
@Injectable()
export class RateLimitGuard implements CanActivate {
  private readonly logger = new Logger(RateLimitGuard.name);

  constructor(private readonly limiter: RateLimiter) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const http = context.switchToHttp();
    const principal = http.getRequest<AuthenticatedRequest>().principal;
    if (principal?.kind !== 'apiKey') {
      return true;
    }

    let state: RateWindowState;
    try {
      state = await this.limiter.hit(`api-key:${principal.apiKeyId}`);
    } catch (error) {
      this.logger.warn(
        `Rate limit check skipped, counter store unavailable: ${error instanceof Error ? error.message : String(error)}`,
      );
      return true;
    }

    const limit = principal.rateLimitPerMinute;
    const resetSeconds = Math.ceil(state.resetInMs / 1000);
    const response = http.getResponse<Response>();
    response.setHeader('X-RateLimit-Limit', limit);
    response.setHeader(
      'X-RateLimit-Remaining',
      Math.max(0, limit - state.count),
    );
    response.setHeader('X-RateLimit-Reset', resetSeconds);

    if (state.count > limit) {
      response.setHeader('Retry-After', resetSeconds);
      throw new HttpException(
        `Too many requests: this API key is limited to ${limit} requests per minute. ` +
          `Try again in ${resetSeconds} seconds, or upgrade your plan for a higher limit.`,
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
    return true;
  }
}
