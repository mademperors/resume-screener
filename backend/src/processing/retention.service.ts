import { Inject, Injectable, Logger } from '@nestjs/common';
import { SessionsRepository } from '../auth/sessions.repository.js';
import {
  retentionConfig,
  type RetentionConfig,
} from '../config/retention.config.js';
import { sessionConfig, type SessionConfig } from '../config/session.config.js';
import { JobsRepository } from '../jobs/jobs.repository.js';
import { ResumeRemovalService } from '../resumes/resume-removal.service.js';
import { ResumesRepository } from '../resumes/resumes.repository.js';

export interface RetentionResult {
  /** Deleted jobs removed for good, with all their data. */
  deletedJobsPurged: number;
  /** Closed jobs whose candidate data was removed; the jobs stay. */
  closedJobsPurged: number;
  resumesRemoved: number;
  /** Stored files still waiting to be deleted after this run. */
  filesPendingDeletion: number;
  /** Sign-in sessions that had ended (revoked, expired or idle). */
  sessionsRemoved: number;
}

const JOBS_PER_BATCH = 50;

/**
 * Personal data retention: a set time (RETENTION_DAYS, one year by default)
 * after a job is closed or deleted, its candidates, resumes, evaluations
 * and files are deleted. Deleted jobs are then removed entirely; closed
 * jobs stay as an empty record. Also retries deleting stored files and
 * deletes sign-in sessions that have ended.
 */
@Injectable()
export class RetentionService {
  private readonly logger = new Logger(RetentionService.name);
  private readonly retentionMs: number;
  private readonly sessionIdleMs: number;

  constructor(
    private readonly jobs: JobsRepository,
    private readonly resumes: ResumesRepository,
    private readonly sessions: SessionsRepository,
    private readonly removal: ResumeRemovalService,
    @Inject(retentionConfig.KEY) retention: RetentionConfig,
    @Inject(sessionConfig.KEY) sessionSettings: SessionConfig,
  ) {
    this.retentionMs = retention.retentionMs;
    this.sessionIdleMs = sessionSettings.idleTimeoutMs;
  }

  async run(now = new Date()): Promise<RetentionResult> {
    const cutoff = new Date(now.getTime() - this.retentionMs);
    const deleted = await this.purgeDeletedJobs(cutoff);
    const closed = await this.purgeClosedJobs(cutoff);
    const result: RetentionResult = {
      deletedJobsPurged: deleted.jobs,
      closedJobsPurged: closed.jobs,
      resumesRemoved: deleted.resumes + closed.resumes,
      filesPendingDeletion: await this.removal.retryPendingDeletions(),
      // Sessions hold refresh token hashes; there is no reason to keep ended ones.
      sessionsRemoved: await this.sessions.deleteEnded(
        now,
        new Date(now.getTime() - this.sessionIdleMs),
      ),
    };
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

  /** Jobs deleted before the cutoff go for good, with all their data. */
  private async purgeDeletedJobs(cutoff: Date) {
    const purged = { jobs: 0, resumes: 0 };
    for (;;) {
      const ids = await this.jobs.deletedBefore(cutoff, JOBS_PER_BATCH);
      if (ids.length === 0) {
        return purged;
      }
      purged.resumes += await this.removal.removeResumes({ jobIds: ids });
      await this.jobs.deletePermanently(ids);
      purged.jobs += ids.length;
    }
  }

  /** Jobs closed before the cutoff lose their candidate data; the jobs stay. */
  private async purgeClosedJobs(cutoff: Date) {
    const purged = { jobs: 0, resumes: 0 };
    let afterId: string | null = null;
    for (;;) {
      const ids = await this.jobs.closedBefore(cutoff, afterId, JOBS_PER_BATCH);
      const withData = await this.resumes.jobsWithResumes(ids);
      if (withData.length > 0) {
        purged.resumes += await this.removal.removeResumes({
          jobIds: withData,
        });
        purged.jobs += withData.length;
      }
      if (ids.length < JOBS_PER_BATCH) {
        return purged;
      }
      afterId = ids.at(-1)!;
    }
  }
}
