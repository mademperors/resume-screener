import { Injectable, Logger } from '@nestjs/common';
import { JobsRepository } from '../jobs/jobs.repository.js';
import type { ResumeTask } from '../queue/processing-queue.js';
import { ResumeStatus, type Resume } from '../resumes/resume.entity.js';
import { ResumesRepository } from '../resumes/resumes.repository.js';
import { FileNotFoundError, FileStorage } from '../storage/file-storage.js';
import { EvaluationRecorder } from './evaluation-recorder.js';
import {
  describeFailure,
  exhaustedMessage,
  PermanentProcessingError,
  UnreadableFileError,
} from './processing-errors.js';
import { assertValidScreeningResult } from './screening-result.js';
import {
  ResumePreprocessor,
  ScoringEngine,
  ScreeningModel,
  TextExtractor,
} from './stages.js';

export type ProcessOutcome = 'processed' | 'unreadable' | 'failed' | 'skipped';

export interface AttemptInfo {
  /** Attempts before this one. */
  attemptsMade: number;
  maxAttempts: number;
}

/** Thrown to the queue so it retries the task after a backoff delay. */
export class RetryLaterError extends Error {
  constructor(resumeId: string, options: { cause: unknown }) {
    super(`Processing resume ${resumeId} failed; will retry`, options);
    this.name = 'RetryLaterError';
  }
}

/**
 * Runs one resume through the pipeline and owns its status changes:
 * Queued -> Processing -> Processed | Could not read file | Processing failed,
 * or back to Queued while retries remain. The stages are injected (see
 * stages.ts); saving the result is EvaluationRecorder's job.
 */
@Injectable()
export class ResumeProcessor {
  private readonly logger = new Logger(ResumeProcessor.name);

  constructor(
    private readonly resumes: ResumesRepository,
    private readonly jobs: JobsRepository,
    private readonly storage: FileStorage,
    private readonly extractor: TextExtractor,
    private readonly preprocessor: ResumePreprocessor,
    private readonly model: ScreeningModel,
    private readonly scoring: ScoringEngine,
    private readonly recorder: EvaluationRecorder,
  ) {}

  /**
   * Resolves when the task is finished, successfully or not. Rejects with
   * RetryLaterError when it should be retried later.
   */
  async process(
    task: ResumeTask,
    attempt: AttemptInfo,
  ): Promise<ProcessOutcome> {
    const resume = await this.resumes.claim(task.resumeId);
    if (!resume) {
      // Deleted, or already finished by another task for the same resume.
      return 'skipped';
    }
    try {
      return await this.run(resume);
    } catch (error) {
      return this.handleFailure(resume, error, attempt);
    }
  }

  private async run(resume: Resume): Promise<ProcessOutcome> {
    const job = await this.jobs.findByIdWithDeleted(resume.jobId);
    if (!job || job.deletedAt) {
      throw new PermanentProcessingError(
        'The job for this resume was deleted.',
      );
    }
    // Always score with the job's current requirements.
    const config = await this.jobs.findConfig(job.currentConfigVersionId ?? '');

    const file = await this.readFile(resume);
    const document = await this.extractor.extract(file, resume.mimeType);
    const prepared = await this.preprocessor.prepare(document);
    const screening = await this.model.evaluate({
      resumeText: prepared.text,
      requirements: config.requirements,
    });
    assertValidScreeningResult(screening, config.requirements);
    const score = this.scoring.score(config, screening, prepared);

    const saved = await this.recorder.record({
      resume,
      job,
      config,
      prepared,
      screening,
      score,
    });
    return saved ? 'processed' : 'skipped';
  }

  private async readFile(resume: Resume): Promise<Buffer> {
    try {
      return await this.storage.get(resume.storageKey);
    } catch (error) {
      if (error instanceof FileNotFoundError) {
        throw new PermanentProcessingError(
          'The uploaded file is missing. Upload it again.',
          { cause: error },
        );
      }
      throw error;
    }
  }

  private async handleFailure(
    resume: Resume,
    error: unknown,
    attempt: AttemptInfo,
  ): Promise<ProcessOutcome> {
    const detail = error instanceof Error ? error.message : String(error);
    if (error instanceof UnreadableFileError) {
      this.logger.log(`Resume ${resume.id} has no readable text: ${detail}`);
      await this.resumes.finishFailed(
        resume.id,
        ResumeStatus.CouldNotReadFile,
        error.userMessage,
        false,
      );
      return 'unreadable';
    }

    const failure = describeFailure(error);
    const lastAttempt = attempt.attemptsMade + 1 >= attempt.maxAttempts;
    if (failure.retryable && !lastAttempt) {
      this.logger.warn(
        `Resume ${resume.id} attempt ${attempt.attemptsMade + 1}/${attempt.maxAttempts} failed, will retry: ${detail}`,
      );
      await this.resumes.returnToQueue(resume.id, failure.userMessage);
      throw new RetryLaterError(resume.id, { cause: error });
    }

    this.logger.error(
      `Resume ${resume.id} failed${failure.retryable ? ' after all retries' : ''}: ${detail}`,
      failure.retryable && error instanceof Error ? error.stack : undefined,
    );
    await this.resumes.finishFailed(
      resume.id,
      ResumeStatus.ProcessingFailed,
      failure.retryable ? exhaustedMessage(failure) : failure.userMessage,
      failure.retryable,
    );
    return 'failed';
  }
}
