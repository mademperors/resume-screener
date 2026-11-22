import { BullModule } from '@nestjs/bullmq';
import { Global, Module } from '@nestjs/common';
import type { Redis } from 'ioredis';
import { BullmqProcessingQueue } from './bullmq-processing-queue.js';
import { ProcessingQueue, RESUME_QUEUE } from './processing-queue.js';
import { REDIS_CONNECTION, RedisModule } from './redis.module.js';

/** Producer side of the processing queue. Workers live in ProcessingModule. */
@Global()
@Module({
  imports: [
    RedisModule,
    BullModule.forRootAsync({
      imports: [RedisModule],
      inject: [REDIS_CONNECTION],
      useFactory: (connection: Redis) => ({ connection }),
    }),
    BullModule.registerQueue({ name: RESUME_QUEUE }),
  ],
  providers: [{ provide: ProcessingQueue, useClass: BullmqProcessingQueue }],
  exports: [ProcessingQueue, BullModule, RedisModule],
})
export class QueueModule {}
