import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, type EntityManager } from 'typeorm';
import { CandidatesRepository } from '../candidates/candidates.repository.js';
import type { Principal } from '../common/principal.js';
import { assertOwnedByCompany } from '../common/tenant.js';
import { ResumesRepository } from '../resumes/resumes.repository.js';
import {
  scoringOf,
  type CreateJobDto,
  type UpdateJobDto,
} from './dto/job.dto.js';
import { Job, JobStatus } from './job.entity.js';
import {
  cleanJobSkills,
  resolveScoring,
  sameRequirements,
} from './job-rules.js';
import { JobsRepository } from './jobs.repository.js';
import {
  buildRequirements,
  DEFAULT_SCORING,
  type JobRequirementsInput,
} from './requirements.js';
import type { ScoringConfigVersion } from './scoring-config-version.entity.js';

export interface JobWithVersion {
  job: Job;
  configVersion: number;
}

/**
 * Jobs and their scoring config versions. Other modules load a job through
 * `getOwned`, which applies the tenant check.
 */
@Injectable()
export class JobsService {
  constructor(
    private readonly jobs: JobsRepository,
    private readonly resumes: ResumesRepository,
    private readonly candidates: CandidatesRepository,
    @InjectDataSource() private readonly db: DataSource,
  ) {}

  async list(companyId: string, status?: JobStatus): Promise<JobWithVersion[]> {
    const jobs = await this.jobs.listByCompany(companyId, status);
    const versions = await this.jobs.versionNumbers(
      jobs.flatMap((job) => job.currentConfigVersionId ?? []),
    );
    return jobs.map((job) => ({
      job,
      configVersion: versions.get(job.currentConfigVersionId ?? '') ?? 0,
    }));
  }

  /** Loads a job of the principal's company: 404 if missing, 403 if foreign. */
  async getOwned(companyId: string, jobId: string): Promise<Job> {
    return assertOwnedByCompany(
      await this.jobs.findById(jobId),
      companyId,
      'job',
    );
  }

  async get(companyId: string, jobId: string): Promise<JobWithVersion> {
    const job = await this.getOwned(companyId, jobId);
    return { job, configVersion: await this.versionNumberOf(job) };
  }

  getCurrentConfig(job: Job): Promise<ScoringConfigVersion> {
    return this.jobs.findConfig(job.currentConfigVersionId ?? '');
  }

  async create(
    principal: Principal,
    dto: CreateJobDto,
  ): Promise<JobWithVersion> {
    const skills = cleanJobSkills(
      dto.requiredSkills,
      dto.preferredSkills ?? [],
    );
    const scoring = resolveScoring(DEFAULT_SCORING, dto.scoring, {
      ...skills,
      minExperienceYears: dto.minExperienceYears,
    });
    return this.db.transaction(async (tx) => {
      const job = await this.jobs.create(
        {
          ...scoring,
          companyId: principal.companyId,
          title: dto.title,
          description: dto.description,
          requiredSkills: skills.requiredSkills,
          preferredSkills: skills.preferredSkills,
          minExperienceYears: dto.minExperienceYears,
          minMatchScore: dto.minMatchScore ?? 0,
          status: JobStatus.Open,
          closedAt: null,
          currentConfigVersionId: null,
          createdByUserId: principal.kind === 'user' ? principal.userId : null,
        },
        tx,
      );
      const config = await this.saveConfigVersion(job, 1, tx);
      job.currentConfigVersionId = config.id;
      await this.jobs.update(job.id, { currentConfigVersionId: config.id }, tx);
      return { job, configVersion: config.version };
    });
  }

  /**
   * Requirement changes create a new scoring config version; existing
   * evaluations keep pointing at the version they were produced with.
   */
  async update(
    companyId: string,
    jobId: string,
    dto: UpdateJobDto,
  ): Promise<JobWithVersion & { rescoreSuggested: boolean }> {
    await this.getOwned(companyId, jobId);
    return this.db.transaction(async (tx) => {
      // Lock the job so concurrent edits can't create the same version twice.
      const job = await this.jobs.lockForUpdate(jobId, tx);
      const current = await this.jobs.findConfigInTransaction(
        job.currentConfigVersionId ?? '',
        tx,
      );

      const skills = cleanJobSkills(
        dto.requiredSkills ?? job.requiredSkills,
        dto.preferredSkills ?? job.preferredSkills,
      );
      const next: JobRequirementsInput = {
        ...skills,
        minExperienceYears: dto.minExperienceYears ?? job.minExperienceYears,
      };
      const scoring = resolveScoring(scoringOf(job), dto.scoring, next);
      // Weights and the review threshold are part of the scoring config too.
      const requirementsChanged =
        !sameRequirements(
          current.requirements,
          buildRequirements(next, scoring),
        ) ||
        current.manualReviewConfidenceThreshold !==
          scoring.manualReviewThreshold;
      const minMatchScoreChanged =
        dto.minMatchScore !== undefined &&
        dto.minMatchScore !== job.minMatchScore;

      Object.assign(job, {
        title: dto.title ?? job.title,
        description: dto.description ?? job.description,
        requiredSkills: next.requiredSkills,
        preferredSkills: next.preferredSkills,
        minExperienceYears: next.minExperienceYears,
        minMatchScore: dto.minMatchScore ?? job.minMatchScore,
        ...scoring,
      });

      let config = current;
      if (requirementsChanged) {
        config = await this.saveConfigVersion(job, current.version + 1, tx);
        job.currentConfigVersionId = config.id;
      }
      await this.jobs.save(job, tx);

      if (minMatchScoreChanged) {
        await this.candidates.refreshBelowThreshold(
          job.id,
          job.minMatchScore,
          tx,
        );
      }
      const rescoreSuggested =
        requirementsChanged && (await this.resumes.existsForJob(job.id, tx));
      return { job, configVersion: config.version, rescoreSuggested };
    });
  }

  /** Soft delete. Retention purges the job's candidate data a year later. */
  async remove(companyId: string, jobId: string): Promise<void> {
    const job = await this.getOwned(companyId, jobId);
    await this.jobs.update(job.id, {
      status: JobStatus.Closed,
      closedAt: job.closedAt ?? new Date(),
    });
    await this.jobs.softDelete(job.id);
  }

  async setStatus(
    companyId: string,
    jobId: string,
    status: JobStatus,
  ): Promise<JobWithVersion> {
    const job = await this.getOwned(companyId, jobId);
    if (job.status !== status) {
      job.status = status;
      job.closedAt = status === JobStatus.Closed ? new Date() : null;
      await this.jobs.save(job);
    }
    return { job, configVersion: await this.versionNumberOf(job) };
  }

  private async versionNumberOf(job: Job): Promise<number> {
    if (!job.currentConfigVersionId) {
      return 0;
    }
    const versions = await this.jobs.versionNumbers([
      job.currentConfigVersionId,
    ]);
    return versions.get(job.currentConfigVersionId) ?? 0;
  }

  private saveConfigVersion(
    job: Job,
    version: number,
    tx: EntityManager,
  ): Promise<ScoringConfigVersion> {
    return this.jobs.createConfig(
      {
        jobId: job.id,
        version,
        requirements: buildRequirements(job, scoringOf(job)),
        manualReviewConfidenceThreshold: job.manualReviewThreshold,
      },
      tx,
    );
  }
}
