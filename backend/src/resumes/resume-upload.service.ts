import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
} from '@nestjs/common';
import { createHash, randomUUID } from 'node:crypto';
import type { Principal } from '../common/principal.js';
import { JobStatus, type Job } from '../jobs/job.entity.js';
import { JobsService } from '../jobs/jobs.service.js';
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
import { ResumeDispatcher } from './resume-dispatcher.js';
import { ResumeStatus, type Resume } from './resume.entity.js';
import { ResumesRepository } from './resumes.repository.js';

/** What the upload needs from a multipart file. */
export interface UploadedFile {
  originalname: string;
  buffer: Buffer;
  size: number;
}

const COULD_NOT_SAVE = 'Could not save the file. Please try again.';

/** Accepting resume files into a job. */
@Injectable()
export class ResumeUploadService {
  private readonly logger = new Logger(ResumeUploadService.name);

  constructor(
    private readonly resumes: ResumesRepository,
    private readonly jobs: JobsService,
    private readonly storage: FileStorage,
    private readonly dispatcher: ResumeDispatcher,
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
    const seen = await this.resumes.firstIdsByHash(job.id, hashes);

    const results: FileUploadResultDto[] = [];
    const accepted: string[] = [];
    for (const [index, file] of files.entries()) {
      const filename = cleanFilename(file.originalname);
      const problem = checkFile(file);
      const type = problem ? null : detectResumeFileType(file.buffer);
      if (problem || !type) {
        results.push({
          filename,
          status: 'rejected',
          reason:
            problem ?? 'Unsupported file format. Upload a PDF or DOCX file.',
        });
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
        results.push({ filename, status: 'rejected', reason: COULD_NOT_SAVE });
        continue;
      }
      seen.set(hash, resume.id);
      results.push({ filename, status: 'accepted', resumeId: resume.id });
      accepted.push(resume.id);
    }

    await this.dispatcher.dispatch(job, accepted);
    const count = (status: FileUploadResultDto['status']) =>
      results.filter((result) => result.status === status).length;
    return {
      results,
      accepted: count('accepted'),
      rejected: count('rejected'),
      duplicates: count('duplicate'),
    };
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
      return await this.resumes.create({
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
      });
    } catch (error) {
      this.logger.error(`Recording resume ${id} failed`, errorStack(error));
      await this.storage.delete(storageKey).catch(() => undefined);
      return null;
    }
  }
}

/** Why the file can't be accepted before looking at its contents, if at all. */
function checkFile(file: UploadedFile): string | null {
  if (file.size === 0) {
    return 'File is empty.';
  }
  if (file.size > MAX_RESUME_FILE_BYTES) {
    return 'File is too large (max 10 MB).';
  }
  return null;
}

function sha256(buffer: Buffer): string {
  return createHash('sha256').update(buffer).digest('hex');
}

function errorStack(error: unknown): string | undefined {
  return error instanceof Error ? error.stack : String(error);
}
