import { ConflictException, Injectable } from '@nestjs/common';
import { CandidatesRepository } from '../candidates/candidates.repository.js';
import { assertOwnedByCompany } from '../common/tenant.js';
import type { Job } from '../jobs/job.entity.js';
import { JobsService } from '../jobs/jobs.service.js';
import type { ProgressDto } from './dto/resume.dto.js';
import { ResumeDispatcher } from './resume-dispatcher.js';
import { ResumeRemovalService } from './resume-removal.service.js';
import { ResumeStatus, type Resume } from './resume.entity.js';
import { ResumesRepository, type ResumePage } from './resumes.repository.js';

/** A job's resumes after upload: listing, progress, retries and deletion. */
@Injectable()
export class ResumesService {
  constructor(
    private readonly resumes: ResumesRepository,
    private readonly candidates: CandidatesRepository,
    private readonly jobs: JobsService,
    private readonly dispatcher: ResumeDispatcher,
    private readonly removal: ResumeRemovalService,
  ) {}

  async list(
    companyId: string,
    jobId: string,
    page: ResumePage,
  ): Promise<{
    items: Resume[];
    total: number;
    candidateIds: Map<string, string>;
  }> {
    await this.jobs.getOwned(companyId, jobId);
    const [items, total] = await this.resumes.listByJob(jobId, page);
    const candidateIds = await this.candidates.idsByResume(
      items.map((resume) => resume.id),
    );
    return { items, total, candidateIds };
  }

  /** Counters for the upload screen, e.g. "Processed 48 of 50, 2 failed". */
  async progress(companyId: string, jobId: string): Promise<ProgressDto> {
    await this.jobs.getOwned(companyId, jobId);
    const counts = await this.resumes.countByStatus(jobId);
    const count = (status: ResumeStatus) => counts.get(status) ?? 0;

    const queued = count(ResumeStatus.Queued);
    const processing = count(ResumeStatus.Processing);
    const processed = count(ResumeStatus.Processed);
    const failed = count(ResumeStatus.ProcessingFailed);
    const unreadable = count(ResumeStatus.CouldNotReadFile);
    const total = queued + processing + processed + failed + unreadable;
    const done = queued + processing === 0;
    return {
      total,
      queued,
      processing,
      processed,
      failed: failed + unreadable,
      processingFailed: failed,
      couldNotRead: unreadable,
      done,
      summary: progressSummary(total, processed, failed + unreadable, done),
    };
  }

  /** Deletes a resume with its candidate, if any, and its file. */
  async remove(companyId: string, resumeId: string): Promise<void> {
    const resume = await this.getOwned(companyId, resumeId);
    await this.removal.removeResumes({ ids: [resume.id] });
  }

  /** Queues one failed resume again. */
  async retry(companyId: string, resumeId: string): Promise<Resume> {
    const resume = await this.getOwned(companyId, resumeId);
    if (resume.status === ResumeStatus.CouldNotReadFile) {
      throw new ConflictException(
        'This file could not be read, so retrying will not help. Upload a text-based PDF or DOCX instead.',
      );
    }
    if (resume.status !== ResumeStatus.ProcessingFailed) {
      throw new ConflictException(
        'Only resumes that failed processing can be retried.',
      );
    }
    const job = await this.jobs.getOwned(companyId, resume.jobId);
    await this.requeue(job, [ResumeStatus.ProcessingFailed], resume.id);
    return this.resumes.findByIdOrFail(resume.id);
  }

  /** Queues all of the job's failed resumes again. */
  async retryFailed(companyId: string, jobId: string): Promise<number> {
    const job = await this.jobs.getOwned(companyId, jobId);
    return this.requeue(job, [ResumeStatus.ProcessingFailed]);
  }

  /**
   * Scores the job's resumes again with its current requirements. Unreadable
   * files and resumes still waiting are left as they are; waiting ones will
   * use the current requirements anyway.
   */
  async rescore(companyId: string, jobId: string): Promise<number> {
    const job = await this.jobs.getOwned(companyId, jobId);
    return this.requeue(job, [
      ResumeStatus.Processed,
      ResumeStatus.ProcessingFailed,
    ]);
  }

  /** A resume of the company whose job still exists. */
  private async getOwned(companyId: string, resumeId: string): Promise<Resume> {
    const resume = assertOwnedByCompany(
      await this.resumes.findById(resumeId),
      companyId,
      'resume',
    );
    await this.jobs.getOwned(companyId, resume.jobId);
    return resume;
  }

  private async requeue(
    job: Job,
    fromStatuses: ResumeStatus[],
    resumeId?: string,
  ): Promise<number> {
    const ids = await this.resumes.requeue(job.id, fromStatuses, resumeId);
    await this.dispatcher.dispatch(job, ids);
    return ids.length;
  }
}

export function progressSummary(
  total: number,
  processed: number,
  failed: number,
  done: boolean,
): string {
  if (total === 0) {
    return 'No resumes uploaded yet';
  }
  if (!done) {
    return `Processing: ${processed + failed} of ${total} done`;
  }
  return (
    `Processed ${processed} of ${total}` +
    (failed > 0 ? `, ${failed} failed` : '')
  );
}
