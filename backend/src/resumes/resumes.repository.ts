import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import {
  Brackets,
  DataSource,
  In,
  type DeepPartial,
  type EntityManager,
  type UpdateQueryBuilder,
} from 'typeorm';
import { Job } from '../jobs/job.entity.js';
import type { ResumeTask } from '../queue/processing-queue.js';
import { Resume, ResumeStatus } from './resume.entity.js';

type ResumePatch = Parameters<UpdateQueryBuilder<Resume>['set']>[0];

export interface ResumePage {
  status?: ResumeStatus;
  page: number;
  pageSize: number;
}

/**
 * Database access for resumes, including the status transitions the
 * pipeline relies on. Every transition re-checks the current status, so a
 * row that moved on meanwhile is left alone. Methods that take `tx` join the
 * caller's transaction.
 */
@Injectable()
export class ResumesRepository {
  constructor(@InjectDataSource() private readonly db: DataSource) {}

  findById(id: string): Promise<Resume | null> {
    return this.resumes().findOneBy({ id });
  }

  findByIdOrFail(id: string): Promise<Resume> {
    return this.resumes().findOneByOrFail({ id });
  }

  /** Locks the resume row until the transaction ends; null if it was deleted. */
  lockForUpdate(id: string, tx: EntityManager): Promise<Resume | null> {
    return this.resumes(tx).findOne({
      where: { id },
      lock: { mode: 'pessimistic_write' },
    });
  }

  listByJob(jobId: string, page: ResumePage): Promise<[Resume[], number]> {
    return this.resumes().findAndCount({
      where: { jobId, ...(page.status ? { status: page.status } : {}) },
      order: { createdAt: 'DESC', id: 'ASC' },
      skip: (page.page - 1) * page.pageSize,
      take: page.pageSize,
    });
  }

  /** How many of the job's resumes are in each status. */
  async countByStatus(jobId: string): Promise<Map<ResumeStatus, number>> {
    const rows = await this.resumes()
      .createQueryBuilder('resume')
      .select('resume.status', 'status')
      .addSelect('COUNT(*)::int', 'count')
      .where('resume.jobId = :jobId', { jobId })
      .groupBy('resume.status')
      .getRawMany<{ status: ResumeStatus; count: number }>();
    return new Map(rows.map((row) => [row.status, row.count]));
  }

  existsForJob(jobId: string, tx?: EntityManager): Promise<boolean> {
    return this.resumes(tx).exists({ where: { jobId } });
  }

  /** Which of these jobs still have resumes. */
  async jobsWithResumes(jobIds: readonly string[]): Promise<string[]> {
    if (jobIds.length === 0) {
      return [];
    }
    const rows = await this.resumes()
      .createQueryBuilder('resume')
      .select('DISTINCT resume.jobId', 'jobId')
      .where('resume.jobId IN (:...jobIds)', { jobIds })
      .getRawMany<{ jobId: string }>();
    return rows.map((row) => row.jobId);
  }

  /** The first resume of the job with each content hash. */
  async firstIdsByHash(
    jobId: string,
    hashes: readonly string[],
  ): Promise<Map<string, string>> {
    if (hashes.length === 0) {
      return new Map();
    }
    const existing = await this.resumes().find({
      where: { jobId, sha256: In([...new Set(hashes)]) },
      select: { id: true, sha256: true },
      order: { createdAt: 'ASC' },
    });
    const byHash = new Map<string, string>();
    for (const resume of existing) {
      if (!byHash.has(resume.sha256)) {
        byHash.set(resume.sha256, resume.id);
      }
    }
    return byHash;
  }

  create(data: DeepPartial<Resume>): Promise<Resume> {
    const resumes = this.resumes();
    return resumes.save(resumes.create(data));
  }

  /**
   * Puts the job's resumes in `fromStatuses` back to Queued, with retry
   * counters reset. Returns the ids that were changed.
   */
  async requeue(
    jobId: string,
    fromStatuses: readonly ResumeStatus[],
    resumeId?: string,
  ): Promise<string[]> {
    const query = this.db
      .createQueryBuilder()
      .update(Resume)
      .set({
        status: ResumeStatus.Queued,
        queuedAt: () => 'now()',
        autoRetryCount: 0,
        lastError: null,
        lastErrorRetryable: false,
      })
      .where('jobId = :jobId', { jobId })
      .andWhere('status IN (:...fromStatuses)', { fromStatuses });
    if (resumeId) {
      query.andWhere('id = :resumeId', { resumeId });
    }
    return idsOf(await query.returning(['id']).execute());
  }

  /** Marks the resume Processing, unless it no longer waits for processing. */
  async claim(id: string): Promise<Resume | null> {
    const result = await this.db
      .createQueryBuilder()
      .update(Resume)
      .set({
        status: ResumeStatus.Processing,
        processingStartedAt: () => 'now()',
        attempts: () => '"attempts" + 1',
      })
      .where('id = :id', { id })
      .andWhere('status IN (:...statuses)', {
        statuses: [ResumeStatus.Queued, ResumeStatus.Processing],
      })
      .execute();
    return result.affected ? this.findById(id) : null;
  }

  async markProcessed(id: string, tx: EntityManager): Promise<void> {
    await this.resumes(tx).update(id, {
      status: ResumeStatus.Processed,
      processedAt: new Date(),
      lastError: null,
      lastErrorRetryable: false,
    });
  }

  /** A failed attempt that will be retried: back to Queued with the reason. */
  async returnToQueue(id: string, message: string): Promise<void> {
    await this.fromProcessing(id, {
      status: ResumeStatus.Queued,
      queuedAt: () => 'now()',
      lastError: message,
      lastErrorRetryable: true,
    });
  }

  async finishFailed(
    id: string,
    status: ResumeStatus.CouldNotReadFile | ResumeStatus.ProcessingFailed,
    message: string,
    retryable: boolean,
  ): Promise<void> {
    await this.fromProcessing(id, {
      status,
      processedAt: () => 'now()',
      lastError: message,
      lastErrorRetryable: retryable,
    });
  }

  /** Queued or Processing since before the cutoff, of jobs that still exist. */
  findStuck(before: Date, limit: number): Promise<ResumeTask[]> {
    return this.tasksOfLiveJobs(limit)
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
  }

  /** Failed for a temporary reason before the cutoff, with retries left. */
  findRetryableFailures(
    before: Date,
    maxAutoRetries: number,
    limit: number,
  ): Promise<ResumeTask[]> {
    return this.tasksOfLiveJobs(limit)
      .andWhere('resume.status = :failed', {
        failed: ResumeStatus.ProcessingFailed,
      })
      .andWhere('resume.lastErrorRetryable = true')
      .andWhere('resume.processedAt < :before', { before })
      .andWhere('resume.autoRetryCount < :max', { max: maxAutoRetries })
      .getRawMany<ResumeTask>();
  }

  /** Back to Queued if still in `fromStatuses`; returns the ids changed. */
  async markQueued(
    ids: readonly string[],
    fromStatuses: readonly ResumeStatus[],
    options: { countAutoRetry: boolean },
  ): Promise<Set<string>> {
    if (ids.length === 0) {
      return new Set();
    }
    const result = await this.db
      .createQueryBuilder()
      .update(Resume)
      .set({
        status: ResumeStatus.Queued,
        queuedAt: () => 'now()',
        ...(options.countAutoRetry
          ? { autoRetryCount: () => '"autoRetryCount" + 1' }
          : {}),
      })
      .where('id IN (:...ids)', { ids })
      .andWhere('status IN (:...fromStatuses)', { fromStatuses })
      .returning(['id'])
      .execute();
    return new Set(idsOf(result));
  }

  /** Ids and file keys of the resumes to delete. */
  findForRemoval(
    criteria: { ids: string[] } | { jobIds: string[] },
    tx: EntityManager,
  ): Promise<Pick<Resume, 'id' | 'storageKey'>[]> {
    const where =
      'ids' in criteria
        ? { id: In(criteria.ids) }
        : { jobId: In(criteria.jobIds) };
    return this.resumes(tx).find({
      where,
      select: { id: true, storageKey: true },
    });
  }

  /** Candidates and evaluations go with their resume (ON DELETE CASCADE). */
  async deleteByIds(ids: readonly string[], tx: EntityManager): Promise<void> {
    if (ids.length > 0) {
      await this.resumes(tx).delete({ id: In([...ids]) });
    }
  }

  private tasksOfLiveJobs(limit: number) {
    return this.resumes()
      .createQueryBuilder('resume')
      .innerJoin(Job, 'job', 'job.id = resume.jobId AND job.deletedAt IS NULL')
      .select('resume.id', 'resumeId')
      .addSelect('job.currentConfigVersionId', 'configVersionId')
      .where('job.currentConfigVersionId IS NOT NULL')
      .orderBy('resume.queuedAt', 'ASC')
      .limit(limit);
  }

  private async fromProcessing(id: string, patch: ResumePatch): Promise<void> {
    await this.db
      .createQueryBuilder()
      .update(Resume)
      .set(patch)
      .where('id = :id AND status = :processing', {
        id,
        processing: ResumeStatus.Processing,
      })
      .execute();
  }

  private resumes(tx?: EntityManager) {
    return (tx ?? this.db.manager).getRepository(Resume);
  }
}

function idsOf(result: { raw: unknown }): string[] {
  return (result.raw as { id: string }[]).map((row) => row.id);
}
