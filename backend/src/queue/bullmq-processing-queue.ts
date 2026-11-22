import { InjectQueue } from '@nestjs/bullmq';
import { Inject, Injectable } from '@nestjs/common';
import type { Queue } from 'bullmq';
import { queueConfig, type QueueConfig } from '../config/queue.config.js';
import {
  ProcessingQueue,
  RESUME_QUEUE,
  resumeTaskId,
  type ResumeTask,
} from './processing-queue.js';

@Injectable()
export class BullmqProcessingQueue extends ProcessingQueue {
  private readonly attempts: number;
  private readonly backoffMs: number;

  constructor(
    @InjectQueue(RESUME_QUEUE) private readonly queue: Queue<ResumeTask>,
    @Inject(queueConfig.KEY) config: QueueConfig,
  ) {
    super();
    this.attempts = config.maxAttempts;
    this.backoffMs = config.backoffMs;
  }

  async enqueue(tasks: readonly ResumeTask[]): Promise<void> {
    if (tasks.length === 0) {
      return;
    }
    await this.queue.addBulk(
      tasks.map((task) => ({
        name: 'process-resume',
        data: {
          resumeId: task.resumeId,
          configVersionId: task.configVersionId,
        },
        opts: {
          // Same id while the job exists: re-adding is ignored, so one
          // resume and config version never runs twice in parallel.
          jobId: resumeTaskId(task),
          attempts: this.attempts,
          backoff: { type: 'exponential', delay: this.backoffMs },
          // The database holds the outcome. Removing finished jobs frees the
          // id, so a manual retry or re-score can add the task again.
          removeOnComplete: true,
          removeOnFail: true,
        },
      })),
    );
  }
}
