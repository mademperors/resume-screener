import { Inject, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, type SelectQueryBuilder } from 'typeorm';
import { assertOwnedByCompany } from '../common/tenant.js';
import { storageConfig, type StorageConfig } from '../config/storage.config.js';
import type { Job } from '../jobs/job.entity.js';
import { JobsService } from '../jobs/jobs.service.js';
import { normalizeSkill } from '../jobs/requirements.js';
import { ScoringConfigVersion } from '../jobs/scoring-config-version.entity.js';
import { ResumeRemovalService } from '../resumes/resume-removal.service.js';
import { Resume } from '../resumes/resume.entity.js';
import { FileStorage } from '../storage/file-storage.js';
import { Candidate, type CandidateDecision } from './candidate.entity.js';
import {
  CandidateSortField,
  type CandidateDetailDto,
  type CandidateFiltersDto,
  type CandidateSummaryDto,
  type DownloadLinkDto,
} from './dto/candidate.dto.js';
import { Evaluation } from './evaluation.entity.js';

const SORT_COLUMNS: Record<CandidateSortField, string> = {
  [CandidateSortField.MatchScore]: 'candidate.matchScore',
  [CandidateSortField.Name]: 'candidate.fullName',
  [CandidateSortField.Experience]: 'candidate.experienceYears',
  [CandidateSortField.Warnings]: 'warning_count',
  [CandidateSortField.Status]: 'candidate.decision',
};

const KEY_SKILLS_SHOWN = 10;

@Injectable()
export class CandidatesService {
  private readonly downloadTtlSeconds: number;

  constructor(
    @InjectRepository(Candidate)
    private readonly candidates: Repository<Candidate>,
    @InjectRepository(Evaluation)
    private readonly evaluations: Repository<Evaluation>,
    @InjectRepository(ScoringConfigVersion)
    private readonly configs: Repository<ScoringConfigVersion>,
    @InjectRepository(Resume) private readonly resumes: Repository<Resume>,
    private readonly jobs: JobsService,
    private readonly storage: FileStorage,
    private readonly removal: ResumeRemovalService,
    @Inject(storageConfig.KEY) config: StorageConfig,
  ) {
    this.downloadTtlSeconds = config.downloadUrlTtlSeconds;
  }

  async list(
    companyId: string,
    jobId: string,
    filters: CandidateFiltersDto,
    page: { page: number; pageSize: number },
  ): Promise<{ job: Job; items: Candidate[]; total: number }> {
    const job = await this.jobs.getOwned(companyId, jobId);
    const [items, total] = await this.filteredQuery(job.id, filters)
      .skip((page.page - 1) * page.pageSize)
      .take(page.pageSize)
      .getManyAndCount();
    return { job, items, total };
  }

  /**
   * Candidates of a job matching the filters, in display order: candidates
   * below the job's minimum score last, then the chosen sort.
   */
  filteredQuery(
    jobId: string,
    filters: CandidateFiltersDto,
  ): SelectQueryBuilder<Candidate> {
    const query = this.candidates
      .createQueryBuilder('candidate')
      .addSelect('cardinality(candidate.flags)', 'warning_count')
      .where('candidate.jobId = :jobId', { jobId });

    if (filters.skills?.length) {
      query.andWhere('candidate.skillsNormalized @> CAST(:skills AS text[])', {
        skills: filters.skills.map(normalizeSkill),
      });
    }
    if (filters.minExperience !== undefined) {
      query.andWhere('candidate.experienceYears >= :minExperience', {
        minExperience: filters.minExperience,
      });
    }
    if (filters.minScore !== undefined) {
      query.andWhere('candidate.matchScore >= :minScore', {
        minScore: filters.minScore,
      });
    }
    if (filters.hasWarnings !== undefined) {
      query.andWhere(
        filters.hasWarnings
          ? 'cardinality(candidate.flags) > 0'
          : 'cardinality(candidate.flags) = 0',
      );
    }
    if (filters.status) {
      query.andWhere('candidate.decision = :decision', {
        decision: filters.status,
      });
    }

    const direction = filters.order === 'asc' ? 'ASC' : 'DESC';
    return query
      .orderBy('candidate.belowThreshold', 'ASC')
      .addOrderBy(SORT_COLUMNS[filters.sortBy], direction, 'NULLS LAST')
      .addOrderBy('candidate.createdAt', 'ASC')
      .addOrderBy('candidate.id', 'ASC');
  }

  async getDetail(
    companyId: string,
    candidateId: string,
  ): Promise<CandidateDetailDto> {
    const candidate = await this.getOwned(companyId, candidateId);
    const [resume, evaluation] = await Promise.all([
      this.resumes.findOneByOrFail({ id: candidate.resumeId }),
      candidate.latestEvaluationId
        ? this.evaluations.findOneBy({ id: candidate.latestEvaluationId })
        : null,
    ]);
    const config = evaluation
      ? await this.configs.findOne({
          where: { id: evaluation.configVersionId },
          select: { id: true, version: true },
        })
      : null;
    const evidence = new Map(
      (evaluation?.verdicts ?? []).map((v) => [
        v.requirementId,
        v.evidence ?? null,
      ]),
    );

    return {
      id: candidate.id,
      jobId: candidate.jobId,
      contacts: {
        name: candidate.fullName,
        email: candidate.email,
        phone: candidate.phone,
        location: candidate.location,
      },
      matchScore: candidate.matchScore,
      experienceYears: candidate.experienceYears,
      belowThreshold: candidate.belowThreshold,
      foundSkills: candidate.skills,
      missingSkills: candidate.missingSkills,
      requirements: (evaluation?.contributions ?? []).map((c) => ({
        requirementId: c.requirementId,
        label: c.label,
        mandatory: c.mandatory,
        met: c.met,
        confidence: c.confidence,
        points: c.points,
        maxPoints: c.maxPoints,
        evidence: evidence.get(c.requirementId) ?? null,
      })),
      warnings: candidate.flags,
      warningDetails: evaluation?.notes ?? [],
      status: candidate.decision,
      evaluation: evaluation
        ? {
            id: evaluation.id,
            configVersion: config?.version ?? 0,
            modelName: evaluation.modelName,
            modelVersion: evaluation.modelVersion,
            evaluatedAt: evaluation.createdAt,
          }
        : null,
      resume: {
        id: resume.id,
        filename: resume.originalFilename,
        sizeBytes: resume.sizeBytes,
        uploadedAt: resume.createdAt,
      },
    };
  }

  async setDecision(
    companyId: string,
    candidateId: string,
    decision: CandidateDecision,
  ): Promise<CandidateDetailDto> {
    const candidate = await this.getOwned(companyId, candidateId);
    await this.candidates.update(candidate.id, { decision });
    return this.getDetail(companyId, candidateId);
  }

  async getResumeLink(
    companyId: string,
    candidateId: string,
  ): Promise<DownloadLinkDto> {
    const candidate = await this.getOwned(companyId, candidateId);
    const resume = await this.resumes.findOneByOrFail({
      id: candidate.resumeId,
    });
    const url = await this.storage.getDownloadUrl(resume.storageKey, {
      filename: resume.originalFilename,
      contentType: resume.mimeType,
      expiresInSeconds: this.downloadTtlSeconds,
    });
    return {
      url,
      expiresAt: new Date(Date.now() + this.downloadTtlSeconds * 1000),
    };
  }

  /** Deletes the candidate with their resume, evaluations and file. */
  async remove(companyId: string, candidateId: string): Promise<void> {
    const candidate = await this.getOwned(companyId, candidateId);
    await this.removal.removeResumes({ ids: [candidate.resumeId] });
  }

  private async getOwned(
    companyId: string,
    candidateId: string,
  ): Promise<Candidate> {
    const candidate = assertOwnedByCompany(
      await this.candidates.findOneBy({ id: candidateId }),
      companyId,
      'candidate',
    );
    // Candidates of a deleted job are no longer accessible.
    await this.jobs.getOwned(companyId, candidate.jobId);
    return candidate;
  }
}

export function toSummary(candidate: Candidate): CandidateSummaryDto {
  return {
    id: candidate.id,
    resumeId: candidate.resumeId,
    name: candidate.fullName,
    matchScore: candidate.matchScore,
    experienceYears: candidate.experienceYears,
    keySkills: candidate.skills.slice(0, KEY_SKILLS_SHOWN),
    warnings: candidate.flags,
    status: candidate.decision,
    belowThreshold: candidate.belowThreshold,
    evaluatedAt: candidate.updatedAt,
  };
}
