import {
  CanActivate,
  ExecutionContext,
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
  Logger,
} from '@nestjs/common';
import type { Response } from 'express';
import type { Redis } from 'ioredis';
import type { AuthenticatedRequest } from '../common/principal.js';
import { REDIS_CONNECTION } from '../queue/redis.module.js';

const WINDOW_MS = 60_000;

/**
 * Global guard, runs after AuthGuard. Limits each API key to its company's
 * requests-per-minute quota (fixed one-minute windows) and answers 429 above
 * it. Counters live in Valkey/Redis, so the limit holds across all API
 * instances. If Redis is unreachable requests are let through rather than
 * blocking every integration.
 */
@Injectable()
export class RateLimitGuard implements CanActivate {
  private readonly logger = new Logger(RateLimitGuard.name);

  constructor(@Inject(REDIS_CONNECTION) private readonly redis: Redis) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const http = context.switchToHttp();
    const principal = http.getRequest<AuthenticatedRequest>().principal;
    if (principal?.kind !== 'apiKey') {
      return true;
    }

    const now = Date.now();
    const window = Math.floor(now / WINDOW_MS);
    const key = `ratelimit:api-key:${principal.apiKeyId}:${window}`;
    let count: number;
    try {
      const results = await this.redis
        .multi()
        .incr(key)
        .pexpire(key, WINDOW_MS * 2)
        .exec();
      const [error, value] = results?.[0] ?? [new Error('No reply'), null];
      if (error) {
        throw error;
      }
      count = Number(value);
    } catch (error) {
      this.logger.warn(
        `Rate limit check skipped, Redis unavailable: ${error instanceof Error ? error.message : String(error)}`,
      );
      return true;
    }

    const limit = principal.rateLimitPerMinute;
    const resetSeconds = Math.ceil(((window + 1) * WINDOW_MS - now) / 1000);
    const response = http.getResponse<Response>();
    response.setHeader('X-RateLimit-Limit', limit);
    response.setHeader('X-RateLimit-Remaining', Math.max(0, limit - count));
    response.setHeader('X-RateLimit-Reset', resetSeconds);

    if (count > limit) {
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
