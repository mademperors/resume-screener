import { Inject, Injectable, Logger } from '@nestjs/common';
import {
  processingConfig,
  type ProcessingConfig,
} from '../config/processing.config.js';
import { ProcessingQueue, type ResumeTask } from '../queue/processing-queue.js';
import { ResumeStatus } from '../resumes/resume.entity.js';
import { ResumesRepository } from '../resumes/resumes.repository.js';

export interface SweepResult {
  /** Queued or Processing for too long; queued again. */
  stale: number;
  /** Failed with a temporary problem a while ago; retried automatically. */
  retriedFailed: number;
}

/** Bounds each sweep so a large backlog is worked through in steps. */
const BATCH_SIZE = 500;

/**
 * Periodic safety net so no uploaded resume is lost:
 * - queues again resumes stuck in Queued or Processing (the queue entry was
 *   lost, or a worker died mid-way); the queue ignores tasks it still has;
 * - retries resumes that failed for a temporary reason, a limited number of
 *   times.
 */
@Injectable()
export class ResumeSweeper {
  private readonly logger = new Logger(ResumeSweeper.name);
  private readonly staleMs: number;
  private readonly retryFailedAfterMs: number;
  private readonly maxAutoRetries: number;

  constructor(
    private readonly resumes: ResumesRepository,
    private readonly queue: ProcessingQueue,
    @Inject(processingConfig.KEY) config: ProcessingConfig,
  ) {
    this.staleMs = config.staleAfterMs;
    this.retryFailedAfterMs = config.failedRetryAfterMs;
    this.maxAutoRetries = config.maxAutoRetries;
  }

  async sweep(now = new Date()): Promise<SweepResult> {
    const stale = await this.requeueStale(now);
    const retriedFailed = await this.retryFailed(now);
    if (stale.length + retriedFailed.length > 0) {
      this.logger.log(
        `Queued ${stale.length} stuck and ${retriedFailed.length} failed resume(s) again`,
      );
    }
    await this.enqueue([...stale, ...retriedFailed]);
    return { stale: stale.length, retriedFailed: retriedFailed.length };
  }

  private async requeueStale(now: Date): Promise<ResumeTask[]> {
    const tasks = await this.resumes.findStuck(
      new Date(now.getTime() - this.staleMs),
      BATCH_SIZE,
    );
    return this.markQueued(
      tasks,
      [ResumeStatus.Queued, ResumeStatus.Processing],
      false,
    );
  }

  private async retryFailed(now: Date): Promise<ResumeTask[]> {
    if (this.retryFailedAfterMs === 0 || this.maxAutoRetries === 0) {
      return [];
    }
    const tasks = await this.resumes.findRetryableFailures(
      new Date(now.getTime() - this.retryFailedAfterMs),
      this.maxAutoRetries,
      BATCH_SIZE,
    );
    return this.markQueued(tasks, [ResumeStatus.ProcessingFailed], true);
  }

  /** Re-checks the status so rows that moved on meanwhile are left alone. */
  private async markQueued(
    tasks: ResumeTask[],
    fromStatuses: ResumeStatus[],
    countAutoRetry: boolean,
  ): Promise<ResumeTask[]> {
    const updated = await this.resumes.markQueued(
      tasks.map((task) => task.resumeId),
      fromStatuses,
      { countAutoRetry },
    );
    return tasks.filter((task) => updated.has(task.resumeId));
  }

  private async enqueue(tasks: ResumeTask[]): Promise<void> {
    try {
      await this.queue.enqueue(tasks);
    } catch (error) {
      // They stay Queued; the next sweep tries again.
      this.logger.warn(
        `Queueing ${tasks.length} resume(s) failed; will try on the next sweep: ${String(error)}`,
      );
    }
  }
}
