import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { createHash, randomUUID } from 'node:crypto';
import { In, Repository } from 'typeorm';
import type { Principal } from '../common/principal.js';
import { assertOwnedByCompany } from '../common/tenant.js';
import { JobStatus, type Job } from '../jobs/job.entity.js';
import { JobsService } from '../jobs/jobs.service.js';
import { ProcessingQueue, type ResumeTask } from '../queue/processing-queue.js';
import { FileStorage, resumeStorageKey } from '../storage/file-storage.js';
import type {
  DuplicateHandling,
  FileUploadResultDto,
  UploadResultDto,
} from './dto/resume.dto.js';
import {
  cleanFilename,
  detectResumeFileType,
  MAX_RESUME_FILE_BYTES,
  RESUME_MIME_TYPES,
} from './file-type.js';
import { Resume, ResumeStatus } from './resume.entity.js';

/** What the upload needs from a multipart file. */
export interface UploadedFile {
  originalname: string;
  buffer: Buffer;
  size: number;
}

const COULD_NOT_SAVE = 'Could not save the file. Please try again.';

@Injectable()
export class ResumesService {
  private readonly logger = new Logger(ResumesService.name);

  constructor(
    @InjectRepository(Resume) private readonly resumes: Repository<Resume>,
    private readonly jobs: JobsService,
    private readonly storage: FileStorage,
    private readonly queue: ProcessingQueue,
  ) {}

  /**
   * Validates each file on its own, so one bad file doesn't stop the rest.
   * Each accepted file is stored, then recorded as Queued, then queued. If
   * queueing fails, the resume stays Queued and the periodic sweep queues it.
   */
  async upload(
    principal: Principal,
    jobId: string,
    files: readonly UploadedFile[],
    onDuplicate: DuplicateHandling,
  ): Promise<UploadResultDto> {
    const job = await this.jobs.getOwned(principal.companyId, jobId);
    if (job.status === JobStatus.Closed) {
      throw new ConflictException(
        'This job is closed. Reopen it to upload resumes.',
      );
    }
    if (files.length === 0) {
      throw new BadRequestException('Choose at least one PDF or DOCX file.');
    }

    const hashes = files.map((file) => sha256(file.buffer));
    const seen = await this.existingResumeIdsByHash(job.id, hashes);

    const results: FileUploadResultDto[] = [];
    const tasks: ResumeTask[] = [];
    for (const [index, file] of files.entries()) {
      const filename = cleanFilename(file.originalname);
      const reject = (reason: string) =>
        results.push({ filename, status: 'rejected', reason });

      if (file.size === 0) {
        reject('File is empty.');
        continue;
      }
      if (file.size > MAX_RESUME_FILE_BYTES) {
        reject('File is too large (max 10 MB).');
        continue;
      }
      const type = detectResumeFileType(file.buffer);
      if (!type) {
        reject('Unsupported file format. Upload a PDF or DOCX file.');
        continue;
      }
      const hash = hashes[index];
      const duplicateOf = seen.get(hash);
      if (duplicateOf && onDuplicate === 'skip') {
        results.push({
          filename,
          status: 'duplicate',
          duplicateOfResumeId: duplicateOf,
          reason: 'This resume was already uploaded to this job.',
        });
        continue;
      }

      const resume = await this.store(job, file, {
        filename,
        hash,
        mimeType: RESUME_MIME_TYPES[type],
      });
      if (!resume) {
        reject(COULD_NOT_SAVE);
        continue;
      }
      seen.set(hash, resume.id);
      results.push({ filename, status: 'accepted', resumeId: resume.id });
      tasks.push({
        resumeId: resume.id,
        configVersionId: job.currentConfigVersionId ?? '',
      });
    }

    await this.enqueueOrLeaveForSweep(tasks);
    const count = (status: FileUploadResultDto['status']) =>
      results.filter((result) => result.status === status).length;
    return {
      results,
      accepted: count('accepted'),
      rejected: count('rejected'),
      duplicates: count('duplicate'),
    };
  }

  async list(
    companyId: string,
    jobId: string,
    options: { status?: ResumeStatus; page: number; pageSize: number },
  ): Promise<{ items: Resume[]; total: number }> {
    await this.jobs.getOwned(companyId, jobId);
    const [items, total] = await this.resumes.findAndCount({
      where: { jobId, ...(options.status ? { status: options.status } : {}) },
      order: { createdAt: 'DESC', id: 'ASC' },
      skip: (options.page - 1) * options.pageSize,
      take: options.pageSize,
    });
    return { items, total };
  }

  /** Queues one failed resume again. */
  async retry(companyId: string, resumeId: string): Promise<Resume> {
    const resume = assertOwnedByCompany(
      await this.resumes.findOneBy({ id: resumeId }),
      companyId,
      'resume',
    );
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
    return this.resumes.findOneByOrFail({ id: resume.id });
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

  private async requeue(
    job: Job,
    fromStatuses: ResumeStatus[],
    resumeId?: string,
  ): Promise<number> {
    const query = this.resumes
      .createQueryBuilder()
      .update(Resume)
      .set({
        status: ResumeStatus.Queued,
        queuedAt: () => 'now()',
        autoRetryCount: 0,
        lastError: null,
        lastErrorRetryable: false,
      })
      .where('jobId = :jobId', { jobId: job.id })
      .andWhere('status IN (:...fromStatuses)', { fromStatuses });
    if (resumeId) {
      query.andWhere('id = :resumeId', { resumeId });
    }
    const result = await query.returning(['id']).execute();
    const ids = (result.raw as { id: string }[]).map((row) => row.id);
    await this.enqueueOrLeaveForSweep(
      ids.map((id) => ({
        resumeId: id,
        configVersionId: job.currentConfigVersionId ?? '',
      })),
    );
    return ids.length;
  }

  /** Stores the file and records it; returns null if either step fails. */
  private async store(
    job: Job,
    file: UploadedFile,
    meta: { filename: string; hash: string; mimeType: string },
  ): Promise<Resume | null> {
    const id = randomUUID();
    const storageKey = resumeStorageKey(job.companyId, job.id, id);
    try {
      await this.storage.put(storageKey, file.buffer, meta.mimeType);
    } catch (error) {
      this.logger.error(`Storing resume ${id} failed`, errorStack(error));
      return null;
    }
    try {
      return await this.resumes.save(
        this.resumes.create({
          id,
          companyId: job.companyId,
          jobId: job.id,
          originalFilename: meta.filename,
          mimeType: meta.mimeType,
          sizeBytes: file.size,
          sha256: meta.hash,
          storageKey,
          status: ResumeStatus.Queued,
          attempts: 0,
          autoRetryCount: 0,
          lastError: null,
          lastErrorRetryable: false,
          queuedAt: new Date(),
          processingStartedAt: null,
          processedAt: null,
        }),
      );
    } catch (error) {
      this.logger.error(`Recording resume ${id} failed`, errorStack(error));
      await this.storage.delete(storageKey).catch(() => undefined);
      return null;
    }
  }

  private async existingResumeIdsByHash(
    jobId: string,
    hashes: string[],
  ): Promise<Map<string, string>> {
    const existing = await this.resumes.find({
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

  private async enqueueOrLeaveForSweep(tasks: ResumeTask[]): Promise<void> {
    try {
      await this.queue.enqueue(tasks);
    } catch (error) {
      // Resumes are already saved as Queued; the sweep will queue them.
      this.logger.warn(
        `Queueing ${tasks.length} resume(s) failed; they will be queued by the periodic sweep`,
        errorStack(error),
      );
    }
  }
}

function sha256(buffer: Buffer): string {
  return createHash('sha256').update(buffer).digest('hex');
}

function errorStack(error: unknown): string | undefined {
  return error instanceof Error ? error.stack : String(error);
}
