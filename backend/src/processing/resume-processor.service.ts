import { Injectable, Logger } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { Candidate } from '../candidates/candidate.entity.js';
import { Evaluation } from '../candidates/evaluation.entity.js';
import { CandidateFlag } from '../candidates/evaluation.types.js';
import { Job } from '../jobs/job.entity.js';
import { normalizeSkill } from '../jobs/requirements.js';
import { ScoringConfigVersion } from '../jobs/scoring-config-version.entity.js';
import type { ResumeTask } from '../queue/processing-queue.js';
import { Resume, ResumeStatus } from '../resumes/resume.entity.js';
import { FileNotFoundError, FileStorage } from '../storage/file-storage.js';
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
  type PreparedResume,
  type ScoreResult,
  type ScreeningResult,
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
 * or back to Queued while retries remain.
 */
@Injectable()
export class ResumeProcessor {
  private readonly logger = new Logger(ResumeProcessor.name);

  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly storage: FileStorage,
    private readonly extractor: TextExtractor,
    private readonly preprocessor: ResumePreprocessor,
    private readonly model: ScreeningModel,
    private readonly scoring: ScoringEngine,
  ) {}

  /**
   * Resolves when the task is finished, successfully or not. Rejects with
   * RetryLaterError when it should be retried later.
   */
  async process(
    task: ResumeTask,
    attempt: AttemptInfo,
  ): Promise<ProcessOutcome> {
    const resume = await this.claim(task.resumeId);
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

  /** Marks the resume Processing, unless it no longer waits for processing. */
  private async claim(resumeId: string): Promise<Resume | null> {
    const result = await this.dataSource
      .createQueryBuilder()
      .update(Resume)
      .set({
        status: ResumeStatus.Processing,
        processingStartedAt: () => 'now()',
        attempts: () => '"attempts" + 1',
      })
      .where('id = :resumeId', { resumeId })
      .andWhere('status IN (:...statuses)', {
        statuses: [ResumeStatus.Queued, ResumeStatus.Processing],
      })
      .execute();
    if (!result.affected) {
      return null;
    }
    return this.dataSource.getRepository(Resume).findOneBy({ id: resumeId });
  }

  private async run(resume: Resume): Promise<ProcessOutcome> {
    const job = await this.dataSource.getRepository(Job).findOne({
      where: { id: resume.jobId },
      withDeleted: true,
    });
    if (!job || job.deletedAt) {
      throw new PermanentProcessingError(
        'The job for this resume was deleted.',
      );
    }
    // Always score with the job's current requirements.
    const config = await this.dataSource
      .getRepository(ScoringConfigVersion)
      .findOneByOrFail({ id: job.currentConfigVersionId ?? '' });

    const file = await this.readFile(resume);
    const document = await this.extractor.extract(file, resume.mimeType);
    const prepared = await this.preprocessor.prepare(document);
    const screening = await this.model.evaluate({
      resumeText: prepared.text,
      requirements: config.requirements,
    });
    assertValidScreeningResult(screening, config.requirements);
    const score = this.scoring.score(config, screening, prepared);

    const saved = await this.save(
      resume,
      job,
      config,
      prepared,
      screening,
      score,
    );
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

  /** Returns false if the resume was deleted while it was being processed. */
  private save(
    resume: Resume,
    job: Job,
    config: ScoringConfigVersion,
    prepared: PreparedResume,
    screening: ScreeningResult,
    score: ScoreResult,
  ): Promise<boolean> {
    const flags = [...score.flags];
    if (
      prepared.manipulationDetected &&
      !flags.includes(CandidateFlag.PossibleManipulation)
    ) {
      flags.push(CandidateFlag.PossibleManipulation);
    }
    const matchScore = roundTo(Math.min(100, Math.max(0, score.matchScore)), 2);
    const experienceYears =
      screening.experienceYears === null
        ? null
        : roundTo(screening.experienceYears, 1);

    return this.dataSource.transaction(async (manager) => {
      const current = await manager.findOne(Resume, {
        where: { id: resume.id },
        lock: { mode: 'pessimistic_write' },
      });
      if (!current) {
        return false;
      }

      // Upsert by resume: a re-score updates the same candidate and keeps
      // the recruiter's decision.
      await manager.upsert(
        Candidate,
        {
          companyId: resume.companyId,
          jobId: resume.jobId,
          resumeId: resume.id,
          fullName: prepared.contacts.fullName,
          email: prepared.contacts.email,
          phone: prepared.contacts.phone,
          location: prepared.contacts.location,
          matchScore,
          experienceYears,
          skills: screening.skills,
          skillsNormalized: [...new Set(screening.skills.map(normalizeSkill))],
          missingSkills: score.missingSkills,
          flags,
          belowThreshold: matchScore < job.minMatchScore,
        },
        { conflictPaths: ['resumeId'] },
      );
      const candidate = await manager.findOneByOrFail(Candidate, {
        resumeId: resume.id,
      });
      const evaluation = await manager.save(
        manager.create(Evaluation, {
          companyId: resume.companyId,
          candidateId: candidate.id,
          configVersionId: config.id,
          modelName: screening.modelName,
          modelVersion: screening.modelVersion,
          matchScore,
          experienceYears,
          verdicts: screening.verdicts,
          contributions: score.contributions,
          foundSkills: score.foundSkills,
          missingSkills: score.missingSkills,
          flags,
        }),
      );
      await manager.update(Candidate, candidate.id, {
        latestEvaluationId: evaluation.id,
      });
      await manager.update(Resume, resume.id, {
        status: ResumeStatus.Processed,
        processedAt: new Date(),
        lastError: null,
        lastErrorRetryable: false,
      });
      return true;
    });
  }

  private async handleFailure(
    resume: Resume,
    error: unknown,
    attempt: AttemptInfo,
  ): Promise<ProcessOutcome> {
    const detail = error instanceof Error ? error.message : String(error);
    if (error instanceof UnreadableFileError) {
      this.logger.log(`Resume ${resume.id} has no readable text: ${detail}`);
      await this.finish(
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
      await this.dataSource
        .createQueryBuilder()
        .update(Resume)
        .set({
          status: ResumeStatus.Queued,
          queuedAt: () => 'now()',
          lastError: failure.userMessage,
          lastErrorRetryable: true,
        })
        .where('id = :id AND status = :status', {
          id: resume.id,
          status: ResumeStatus.Processing,
        })
        .execute();
      throw new RetryLaterError(resume.id, { cause: error });
    }

    this.logger.error(
      `Resume ${resume.id} failed${failure.retryable ? ' after all retries' : ''}: ${detail}`,
      failure.retryable && error instanceof Error ? error.stack : undefined,
    );
    await this.finish(
      resume.id,
      ResumeStatus.ProcessingFailed,
      failure.retryable ? exhaustedMessage(failure) : failure.userMessage,
      failure.retryable,
    );
    return 'failed';
  }

  private async finish(
    resumeId: string,
    status: ResumeStatus.CouldNotReadFile | ResumeStatus.ProcessingFailed,
    message: string,
    retryable: boolean,
  ): Promise<void> {
    await this.dataSource
      .createQueryBuilder()
      .update(Resume)
      .set({
        status,
        processedAt: () => 'now()',
        lastError: message,
        lastErrorRetryable: retryable,
      })
      .where('id = :id AND status = :processing', {
        id: resumeId,
        processing: ResumeStatus.Processing,
      })
      .execute();
  }
}

function roundTo(value: number, digits: number): number {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}
