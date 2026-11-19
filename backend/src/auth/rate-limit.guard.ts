import {
  CanActivate,
  ExecutionContext,
  HttpException,
  HttpStatus,
  Injectable,
} from '@nestjs/common';
import type { Response } from 'express';
import type { AuthenticatedRequest } from '../common/principal.js';

const WINDOW_MS = 60_000;

interface Window {
  startedAt: number;
  count: number;
}

/**
 * Global guard, runs after AuthGuard. Limits each API key to its company's
 * requests-per-minute quota (fixed one-minute window) and answers 429 above it.
 *
 * Counters live in process memory, so with several API instances each one
 * counts separately. Move them to Redis when the API is scaled out.
 */
@Injectable()
export class RateLimitGuard implements CanActivate {
  private readonly windows = new Map<string, Window>();

  canActivate(context: ExecutionContext): boolean {
    const http = context.switchToHttp();
    const principal = http.getRequest<AuthenticatedRequest>().principal;
    if (principal?.kind !== 'apiKey') {
      return true;
    }

    const now = Date.now();
    let window = this.windows.get(principal.apiKeyId);
    if (!window || now - window.startedAt >= WINDOW_MS) {
      window = { startedAt: now, count: 0 };
      this.windows.set(principal.apiKeyId, window);
    }
    window.count += 1;

    const limit = principal.rateLimitPerMinute;
    const resetSeconds = Math.ceil((window.startedAt + WINDOW_MS - now) / 1000);
    const response = http.getResponse<Response>();
    response.setHeader('X-RateLimit-Limit', limit);
    response.setHeader(
      'X-RateLimit-Remaining',
      Math.max(0, limit - window.count),
    );
    response.setHeader('X-RateLimit-Reset', resetSeconds);

    if (window.count > limit) {
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
