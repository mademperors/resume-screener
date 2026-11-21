import { Injectable } from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, In, Repository, type EntityManager } from 'typeorm';
import { Candidate } from '../candidates/candidate.entity.js';
import { RequestValidationException } from '../common/http-exception.filter.js';
import type { Principal } from '../common/principal.js';
import { assertOwnedByCompany } from '../common/tenant.js';
import { Resume } from '../resumes/resume.entity.js';
import {
  scoringOf,
  type CreateJobDto,
  type ScoringSettingsInputDto,
  type UpdateJobDto,
} from './dto/job.dto.js';
import { Job, JobStatus } from './job.entity.js';
import {
  buildRequirements,
  cleanSkills,
  DEFAULT_SCORING,
  normalizeSkill,
  type JobRequirementsInput,
  type RequirementSpec,
  type ScoringSettings,
} from './requirements.js';
import { ScoringConfigVersion } from './scoring-config-version.entity.js';

export interface JobWithVersion {
  job: Job;
  configVersion: number;
}

@Injectable()
export class JobsService {
  constructor(
    @InjectRepository(Job) private readonly jobs: Repository<Job>,
    @InjectRepository(ScoringConfigVersion)
    private readonly configs: Repository<ScoringConfigVersion>,
    @InjectDataSource() private readonly dataSource: DataSource,
  ) {}

  async list(companyId: string, status?: JobStatus): Promise<JobWithVersion[]> {
    const jobs = await this.jobs.find({
      where: { companyId, ...(status ? { status } : {}) },
      order: { createdAt: 'DESC' },
    });
    const versionIds = jobs
      .map((job) => job.currentConfigVersionId)
      .filter((id): id is string => id !== null);
    const versions = versionIds.length
      ? await this.configs.find({
          where: { id: In(versionIds) },
          select: { id: true, version: true },
        })
      : [];
    const versionById = new Map(versions.map((v) => [v.id, v.version]));
    return jobs.map((job) => ({
      job,
      configVersion: versionById.get(job.currentConfigVersionId ?? '') ?? 0,
    }));
  }

  /** Loads a job of the principal's company: 404 if missing, 403 if foreign. */
  async getOwned(companyId: string, jobId: string): Promise<Job> {
    return assertOwnedByCompany(
      await this.jobs.findOneBy({ id: jobId }),
      companyId,
      'job',
    );
  }

  async get(companyId: string, jobId: string): Promise<JobWithVersion> {
    const job = await this.getOwned(companyId, jobId);
    return { job, configVersion: await this.versionNumberOf(job) };
  }

  async getCurrentConfig(job: Job): Promise<ScoringConfigVersion> {
    return this.configs.findOneByOrFail({
      id: job.currentConfigVersionId ?? '',
    });
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
    return this.dataSource.transaction(async (manager) => {
      const job = await manager.save(
        manager.create(Job, {
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
        }),
      );
      const config = await this.saveConfigVersion(manager, job, 1);
      job.currentConfigVersionId = config.id;
      await manager.update(Job, job.id, {
        currentConfigVersionId: config.id,
      });
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
    return this.dataSource.transaction(async (manager) => {
      // Lock the job so concurrent edits can't create the same version twice.
      const job = await manager.findOneOrFail(Job, {
        where: { id: jobId },
        lock: { mode: 'pessimistic_write' },
      });
      const current = await manager.findOneByOrFail(ScoringConfigVersion, {
        id: job.currentConfigVersionId ?? '',
      });

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
        config = await this.saveConfigVersion(
          manager,
          job,
          current.version + 1,
        );
        job.currentConfigVersionId = config.id;
      }
      await manager.save(job);

      if (minMatchScoreChanged) {
        await this.refreshThresholdFlags(manager, job);
      }
      const rescoreSuggested =
        requirementsChanged &&
        (await manager.exists(Resume, { where: { jobId: job.id } }));
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
    const config = await this.configs.findOne({
      where: { id: job.currentConfigVersionId },
      select: { id: true, version: true },
    });
    return config?.version ?? 0;
  }

  private saveConfigVersion(
    manager: EntityManager,
    job: Job,
    version: number,
  ): Promise<ScoringConfigVersion> {
    return manager.save(
      manager.create(ScoringConfigVersion, {
        jobId: job.id,
        version,
        requirements: buildRequirements(job, scoringOf(job)),
        manualReviewConfidenceThreshold: job.manualReviewThreshold,
      }),
    );
  }

  /** The threshold only moves candidates between the main list and the bottom. */
  private async refreshThresholdFlags(
    manager: EntityManager,
    job: Job,
  ): Promise<void> {
    await manager
      .createQueryBuilder()
      .update(Candidate)
      .set({
        belowThreshold: () =>
          `("matchScore" IS NOT NULL AND "matchScore" < ${Number(job.minMatchScore)})`,
      })
      .where('jobId = :jobId', { jobId: job.id })
      .execute();
  }
}

/**
 * Removes duplicates and rejects a skill listed as both required and
 * preferred, which would make its weight ambiguous.
 */
export function cleanJobSkills(
  requiredSkills: readonly string[],
  preferredSkills: readonly string[],
): { requiredSkills: string[]; preferredSkills: string[] } {
  const required = cleanSkills(requiredSkills);
  const preferred = cleanSkills(preferredSkills);
  if (required.length === 0) {
    throw new RequestValidationException([
      { field: 'requiredSkills', messages: ['Add at least one value.'] },
    ]);
  }
  const requiredKeys = new Set(required.map(normalizeSkill));
  const overlap = preferred.filter((skill) =>
    requiredKeys.has(normalizeSkill(skill)),
  );
  if (overlap.length > 0) {
    throw new RequestValidationException([
      {
        field: 'preferredSkills',
        messages: overlap.map(
          (skill) => `${skill} is already a required skill. List it only once.`,
        ),
      },
    ]);
  }
  return { requiredSkills: required, preferredSkills: preferred };
}

/**
 * The job's scoring settings after applying the input over the current
 * ones. Per-skill weights must name one of the job's skills; weights for
 * skills no longer in the job are dropped. At least one requirement must
 * carry weight, or every candidate would score 0.
 */
export function resolveScoring(
  current: Readonly<ScoringSettings>,
  input: ScoringSettingsInputDto | undefined,
  job: JobRequirementsInput,
): ScoringSettings {
  const jobSkills = new Map(
    [...job.requiredSkills, ...job.preferredSkills].map((skill) => [
      normalizeSkill(skill),
      skill,
    ]),
  );
  const unknown: string[] = [];
  const skillWeights = new Map<string, { skill: string; weight: number }>();
  for (const entry of input?.skillWeights ?? current.skillWeights) {
    const skill = jobSkills.get(normalizeSkill(entry.skill));
    if (skill) {
      skillWeights.set(normalizeSkill(skill), { skill, weight: entry.weight });
    } else if (input?.skillWeights) {
      unknown.push(entry.skill);
    }
  }
  if (unknown.length > 0) {
    throw new RequestValidationException([
      {
        field: 'scoring.skillWeights',
        messages: unknown.map(
          (skill) => `${skill} is not one of this job's skills.`,
        ),
      },
    ]);
  }

  const scoring: ScoringSettings = {
    requiredSkillWeight:
      input?.requiredSkillWeight ?? current.requiredSkillWeight,
    preferredSkillWeight:
      input?.preferredSkillWeight ?? current.preferredSkillWeight,
    experienceWeight: input?.experienceWeight ?? current.experienceWeight,
    skillWeights: [...skillWeights.values()],
    manualReviewThreshold:
      input?.manualReviewThreshold ?? current.manualReviewThreshold,
  };
  const totalWeight = buildRequirements(job, scoring).reduce(
    (sum, requirement) => sum + requirement.weight,
    0,
  );
  if (totalWeight <= 0) {
    throw new RequestValidationException([
      {
        field: 'scoring',
        messages: ['At least one requirement needs a weight above 0.'],
      },
    ]);
  }
  return scoring;
}

/** Compares what affects scoring; renaming "typescript" to "TypeScript" doesn't. */
export function sameRequirements(
  a: readonly RequirementSpec[],
  b: readonly RequirementSpec[],
): boolean {
  const key = (r: RequirementSpec) =>
    `${r.id}|${r.mandatory}|${r.weight}|${r.minYears ?? ''}`;
  const left = a.map(key).sort();
  const right = b.map(key).sort();
  return (
    left.length === right.length &&
    left.every((value, index) => value === right[index])
  );
}
