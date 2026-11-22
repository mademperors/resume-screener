import {
  Inject,
  Injectable,
  Logger,
  type OnApplicationShutdown,
} from '@nestjs/common';
import { Queue, Worker } from 'bullmq';
import type { Redis } from 'ioredis';
import {
  processingConfig,
  type ProcessingConfig,
} from '../config/processing.config.js';
import { queueConfig, type QueueConfig } from '../config/queue.config.js';
import {
  retentionConfig,
  type RetentionConfig,
} from '../config/retention.config.js';
import { RESUME_QUEUE, type ResumeTask } from '../queue/processing-queue.js';
import { createRedisClient } from '../queue/redis.module.js';
import { ResumeProcessor } from './resume-processor.service.js';
import { ResumeSweeper } from './resume-sweeper.service.js';
import { RetentionService } from './retention.service.js';

export const MAINTENANCE_QUEUE = 'resume-maintenance';
const SWEEP_SCHEDULER_ID = 'sweep-resumes';
const RETENTION_SCHEDULER_ID = 'data-retention';

/**
 * Background processing. Started by the worker process (src/worker.ts), or by
 * the API when RUN_WORKER_IN_API=true (handy in development).
 *
 * Scale out by running more worker processes, or up with WORKER_CONCURRENCY.
 * The request limit to the screening model is shared by all workers.
 */
@Injectable()
export class ResumeWorker implements OnApplicationShutdown {
  private readonly logger = new Logger(ResumeWorker.name);
  private readonly redisUrl: string;
  private readonly concurrency: number;
  private readonly ratePerSecond: number;
  private readonly sweepIntervalMs: number;
  private readonly retentionIntervalMs: number;

  private connection: Redis | null = null;
  private workers: Worker[] = [];
  private maintenanceQueue: Queue | null = null;

  constructor(
    private readonly processor: ResumeProcessor,
    private readonly sweeper: ResumeSweeper,
    private readonly retention: RetentionService,
    @Inject(queueConfig.KEY) queue: QueueConfig,
    @Inject(processingConfig.KEY) processing: ProcessingConfig,
    @Inject(retentionConfig.KEY) retentionSettings: RetentionConfig,
  ) {
    this.redisUrl = queue.redisUrl;
    this.concurrency = processing.concurrency;
    this.ratePerSecond = processing.screeningRatePerSecond;
    this.sweepIntervalMs = processing.sweepIntervalMs;
    this.retentionIntervalMs = retentionSettings.intervalMs;
  }

  get running(): boolean {
    return this.workers.length > 0;
  }

  async start(): Promise<void> {
    if (this.running) {
      return;
    }
    // Own connection: closed here after the workers, independent of the
    // API's shared client. BullMQ adds its own blocking connections.
    const connection = createRedisClient(this.redisUrl);
    this.connection = connection;

    const processing = new Worker<ResumeTask>(
      RESUME_QUEUE,
      (job) =>
        this.processor.process(job.data, {
          attemptsMade: job.attemptsMade,
          maxAttempts: job.opts.attempts ?? 1,
        }),
      {
        connection,
        concurrency: this.concurrency,
        // Global across all workers: at most this many resumes per second
        // reach the screening model.
        limiter: { max: this.ratePerSecond, duration: 1000 },
      },
    );
    this.watch(processing, 'Resume processing');

    this.maintenanceQueue = new Queue(MAINTENANCE_QUEUE, { connection });
    // Idempotent: every worker upserts the same schedules, and each run
    // happens once per interval across all workers.
    const opts = { removeOnComplete: true, removeOnFail: 100 };
    await this.maintenanceQueue.upsertJobScheduler(
      SWEEP_SCHEDULER_ID,
      { every: this.sweepIntervalMs },
      { name: 'sweep', opts },
    );
    await this.maintenanceQueue.upsertJobScheduler(
      RETENTION_SCHEDULER_ID,
      { every: this.retentionIntervalMs },
      { name: 'retention', opts },
    );
    const maintenance = new Worker(
      MAINTENANCE_QUEUE,
      (job) =>
        job.name === 'retention' ? this.retention.run() : this.sweeper.sweep(),
      { connection, concurrency: 1 },
    );
    this.watch(maintenance, 'Maintenance');

    this.workers = [processing, maintenance];
    this.logger.log(
      `Processing resumes: concurrency ${this.concurrency}, ` +
        `up to ${this.ratePerSecond}/s to the screening model, sweep every ${this.sweepIntervalMs / 1000}s, retention every ${this.retentionIntervalMs / 60_000} min`,
    );
  }

  async stop(): Promise<void> {
    // Waits for running tasks to finish; unfinished ones are picked up again.
    await Promise.all(this.workers.map((worker) => worker.close()));
    this.workers = [];
    await this.maintenanceQueue?.close();
    this.maintenanceQueue = null;
    await this.connection?.quit().catch(() => this.connection?.disconnect());
    this.connection = null;
  }

  onApplicationShutdown(): Promise<void> {
    return this.stop();
  }

  private watch(worker: Worker, label: string): void {
    worker.on('error', (error) =>
      this.logger.error(`${label} worker error: ${error.message}`),
    );
    worker.on('failed', (job, error) => {
      // Retries are logged by ResumeProcessor; this covers anything unexpected.
      if (error.name !== 'RetryLaterError') {
        this.logger.error(
          `${label} job ${job?.id ?? '?'} failed: ${error.message}`,
        );
      }
    });
  }
}
