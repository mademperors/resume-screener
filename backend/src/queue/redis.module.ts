import {
  Inject,
  Injectable,
  Logger,
  Module,
  type OnApplicationShutdown,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Redis } from 'ioredis';
import type { EnvironmentVariables } from '../config/env.validation.js';

/** The shared ioredis client. BullMQ needs a client instance under native ESM. */
export const REDIS_CONNECTION = Symbol('REDIS_CONNECTION');

export function createRedisClient(url: string): Redis {
  // BullMQ requires maxRetriesPerRequest: null so blocking calls never time out.
  return new Redis(url, { maxRetriesPerRequest: null });
}

@Injectable()
class RedisConnectionCloser implements OnApplicationShutdown {
  private readonly logger = new Logger('Redis');

  constructor(@Inject(REDIS_CONNECTION) private readonly redis: Redis) {}

  async onApplicationShutdown(): Promise<void> {
    try {
      await this.redis.quit();
    } catch (error) {
      this.logger.warn(`Closing the Redis connection failed: ${String(error)}`);
      this.redis.disconnect();
    }
  }
}

@Module({
  providers: [
    {
      provide: REDIS_CONNECTION,
      inject: [ConfigService],
      useFactory: (config: ConfigService<EnvironmentVariables, true>) =>
        createRedisClient(config.get('REDIS_URL', { infer: true })),
    },
    RedisConnectionCloser,
  ],
  exports: [REDIS_CONNECTION],
})
export class RedisModule {}
