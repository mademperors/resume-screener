import { Inject, Injectable, Logger } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { Brackets, DataSource } from 'typeorm';
import {
  processingConfig,
  type ProcessingConfig,
} from '../config/processing.config.js';
import { Job } from '../jobs/job.entity.js';
import { ProcessingQueue, type ResumeTask } from '../queue/processing-queue.js';
import { Resume, ResumeStatus } from '../resumes/resume.entity.js';

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
    @InjectDataSource() private readonly dataSource: DataSource,
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
    const before = new Date(now.getTime() - this.staleMs);
    const rows = await this.candidates()
      .andWhere(
        new Brackets((where) =>
          where
            .where('resume.status = :queued AND resume.queuedAt < :before')
            .orWhere(
              'resume.status = :processing AND resume.processingStartedAt < :before',
            ),
        ),
      )
      .setParameters({
        queued: ResumeStatus.Queued,
        processing: ResumeStatus.Processing,
        before,
      })
      .getRawMany<ResumeTask>();
    return this.markQueued(
      rows,
      [ResumeStatus.Queued, ResumeStatus.Processing],
      {},
    );
  }

  private async retryFailed(now: Date): Promise<ResumeTask[]> {
    if (this.retryFailedAfterMs === 0 || this.maxAutoRetries === 0) {
      return [];
    }
    const rows = await this.candidates()
      .andWhere('resume.status = :failed', {
        failed: ResumeStatus.ProcessingFailed,
      })
      .andWhere('resume.lastErrorRetryable = true')
      .andWhere('resume.processedAt < :before', {
        before: new Date(now.getTime() - this.retryFailedAfterMs),
      })
      .andWhere('resume.autoRetryCount < :max', { max: this.maxAutoRetries })
      .getRawMany<ResumeTask>();
    return this.markQueued(rows, [ResumeStatus.ProcessingFailed], {
      autoRetryCount: () => '"autoRetryCount" + 1',
    });
  }

  /** Resumes of jobs that still exist, with the job's current config. */
  private candidates() {
    return this.dataSource
      .getRepository(Resume)
      .createQueryBuilder('resume')
      .innerJoin(Job, 'job', 'job.id = resume.jobId AND job.deletedAt IS NULL')
      .select('resume.id', 'resumeId')
      .addSelect('job.currentConfigVersionId', 'configVersionId')
      .where('job.currentConfigVersionId IS NOT NULL')
      .orderBy('resume.queuedAt', 'ASC')
      .limit(BATCH_SIZE);
  }

  /** Re-checks the status so rows that moved on meanwhile are left alone. */
  private async markQueued(
    rows: ResumeTask[],
    fromStatuses: ResumeStatus[],
    extra: Record<string, () => string>,
  ): Promise<ResumeTask[]> {
    if (rows.length === 0) {
      return [];
    }
    const result = await this.dataSource
      .createQueryBuilder()
      .update(Resume)
      .set({ status: ResumeStatus.Queued, queuedAt: () => 'now()', ...extra })
      .where('id IN (:...ids)', { ids: rows.map((row) => row.resumeId) })
      .andWhere('status IN (:...fromStatuses)', { fromStatuses })
      .returning(['id'])
      .execute();
    const updated = new Set(
      (result.raw as { id: string }[]).map((row) => row.id),
    );
    return rows.filter((row) => updated.has(row.resumeId));
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
