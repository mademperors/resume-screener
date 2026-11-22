import { Injectable, Logger } from '@nestjs/common';
import type { Job } from '../jobs/job.entity.js';
import { ProcessingQueue } from '../queue/processing-queue.js';

/**
 * Hands resumes that are already saved as Queued to the workers, scored
 * against the job's current config. If the queue is down they stay Queued
 * and the periodic sweep queues them, so callers never fail because of it.
 */
@Injectable()
export class ResumeDispatcher {
  private readonly logger = new Logger(ResumeDispatcher.name);

  constructor(private readonly queue: ProcessingQueue) {}

  async dispatch(job: Job, resumeIds: readonly string[]): Promise<void> {
    if (resumeIds.length === 0) {
      return;
    }
    try {
      await this.queue.enqueue(
        resumeIds.map((resumeId) => ({
          resumeId,
          configVersionId: job.currentConfigVersionId ?? '',
        })),
      );
    } catch (error) {
      this.logger.warn(
        `Queueing ${resumeIds.length} resume(s) failed; the periodic sweep will queue them`,
        error instanceof Error ? error.stack : String(error),
      );
    }
  }
}
