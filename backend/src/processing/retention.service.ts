import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, IsNull, LessThan, MoreThan } from 'typeorm';
import type { EnvironmentVariables } from '../config/env.validation.js';
import { Job, JobStatus } from '../jobs/job.entity.js';
import { ResumeRemovalService } from '../resumes/resume-removal.service.js';

export interface RetentionResult {
  /** Deleted jobs removed for good, with all their data. */
  deletedJobsPurged: number;
  /** Closed jobs whose candidate data was removed; the jobs stay. */
  closedJobsPurged: number;
  resumesRemoved: number;
  /** Stored files still waiting to be deleted after this run. */
  filesPendingDeletion: number;
}

const JOBS_PER_BATCH = 50;

/**
 * Personal data retention: a set time (RETENTION_DAYS, one year by default)
 * after a job is closed or deleted, its candidates, resumes, evaluations
 * and files are deleted. Deleted jobs are then removed entirely; closed
 * jobs stay as an empty record. Also retries deleting stored files.
 */
@Injectable()
export class RetentionService {
  private readonly logger = new Logger(RetentionService.name);
  private readonly retentionMs: number;

  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly removal: ResumeRemovalService,
    config: ConfigService<EnvironmentVariables, true>,
  ) {
    this.retentionMs =
      config.get('RETENTION_DAYS', { infer: true }) * 86_400_000;
  }

  async run(now = new Date()): Promise<RetentionResult> {
    const cutoff = new Date(now.getTime() - this.retentionMs);
    const jobs = this.dataSource.getRepository(Job);
    const result: RetentionResult = {
      deletedJobsPurged: 0,
      closedJobsPurged: 0,
      resumesRemoved: 0,
      filesPendingDeletion: 0,
    };

    for (;;) {
      const deleted = await jobs.find({
        where: { deletedAt: LessThan(cutoff) },
        withDeleted: true,
        select: { id: true },
        take: JOBS_PER_BATCH,
      });
      if (deleted.length === 0) {
        break;
      }
      const ids = deleted.map((job) => job.id);
      result.resumesRemoved += await this.removal.removeResumes({
        jobIds: ids,
      });
      // Scoring configs go with the job (ON DELETE CASCADE).
      await jobs.delete(ids);
      result.deletedJobsPurged += ids.length;
    }

    let lastClosedId: string | null = null;
    for (;;) {
      const closed = await jobs.find({
        where: {
          status: JobStatus.Closed,
          closedAt: LessThan(cutoff),
          deletedAt: IsNull(),
          ...(lastClosedId ? { id: MoreThan(lastClosedId) } : {}),
        },
        select: { id: true },
        order: { id: 'ASC' },
        take: JOBS_PER_BATCH,
      });
      // Only closed jobs that still have resumes need work.
      const withData = await this.jobsWithResumes(closed.map((job) => job.id));
      if (withData.length > 0) {
        result.resumesRemoved += await this.removal.removeResumes({
          jobIds: withData,
        });
        result.closedJobsPurged += withData.length;
      }
      if (closed.length < JOBS_PER_BATCH) {
        break;
      }
      lastClosedId = closed.at(-1)!.id;
    }

    result.filesPendingDeletion = await this.removal.retryPendingDeletions();
    if (result.resumesRemoved > 0 || result.deletedJobsPurged > 0) {
      this.logger.log(
        `Retention removed ${result.resumesRemoved} resume(s) from ${result.closedJobsPurged} closed and ${result.deletedJobsPurged} deleted job(s)`,
      );
    }
    if (result.filesPendingDeletion > 0) {
      this.logger.warn(
        `${result.filesPendingDeletion} stored file(s) still waiting to be deleted`,
      );
    }
    return result;
  }

  private async jobsWithResumes(jobIds: string[]): Promise<string[]> {
    if (jobIds.length === 0) {
      return [];
    }
    const rows = await this.dataSource.query<{ jobId: string }[]>(
      `SELECT DISTINCT "jobId" FROM resumes WHERE "jobId" = ANY($1)`,
      [jobIds],
    );
    return rows.map((row) => row.jobId);
  }
}
