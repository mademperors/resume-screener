import { Inject, Injectable } from '@nestjs/common';
import { assertOwnedByCompany } from '../common/tenant.js';
import { storageConfig, type StorageConfig } from '../config/storage.config.js';
import type { Job } from '../jobs/job.entity.js';
import { JobsRepository } from '../jobs/jobs.repository.js';
import { JobsService } from '../jobs/jobs.service.js';
import { ResumeRemovalService } from '../resumes/resume-removal.service.js';
import type { Resume } from '../resumes/resume.entity.js';
import { ResumesRepository } from '../resumes/resumes.repository.js';
import { FileStorage } from '../storage/file-storage.js';
import type { Candidate, CandidateDecision } from './candidate.entity.js';
import { CandidatesRepository } from './candidates.repository.js';
import type {
  CandidateDetailDto,
  CandidateFiltersDto,
  CandidateSummaryDto,
  DownloadLinkDto,
} from './dto/candidate.dto.js';
import type { Evaluation } from './evaluation.entity.js';
import { EvaluationsRepository } from './evaluations.repository.js';

const KEY_SKILLS_SHOWN = 10;

/** The recruiter's view of a job's candidates and their decisions. */
@Injectable()
export class CandidatesService {
  private readonly downloadTtlSeconds: number;

  constructor(
    private readonly candidates: CandidatesRepository,
    private readonly evaluations: EvaluationsRepository,
    private readonly resumes: ResumesRepository,
    private readonly jobConfigs: JobsRepository,
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
    const [items, total] = await this.candidates.findPage(
      job.id,
      filters,
      page,
    );
    return { job, items, total };
  }

  async getDetail(
    companyId: string,
    candidateId: string,
  ): Promise<CandidateDetailDto> {
    const candidate = await this.getOwned(companyId, candidateId);
    const [resume, evaluation] = await Promise.all([
      this.resumes.findByIdOrFail(candidate.resumeId),
      candidate.latestEvaluationId
        ? this.evaluations.findById(candidate.latestEvaluationId)
        : null,
    ]);
    const configVersion = evaluation
      ? ((
          await this.jobConfigs.versionNumbers([evaluation.configVersionId])
        ).get(evaluation.configVersionId) ?? 0)
      : 0;
    return toDetail(candidate, resume, evaluation, configVersion);
  }

  async setDecision(
    companyId: string,
    candidateId: string,
    decision: CandidateDecision,
  ): Promise<CandidateDetailDto> {
    const candidate = await this.getOwned(companyId, candidateId);
    await this.candidates.setDecision(candidate.id, decision);
    return this.getDetail(companyId, candidateId);
  }

  async getResumeLink(
    companyId: string,
    candidateId: string,
  ): Promise<DownloadLinkDto> {
    const candidate = await this.getOwned(companyId, candidateId);
    const resume = await this.resumes.findByIdOrFail(candidate.resumeId);
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
      await this.candidates.findById(candidateId),
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

function toDetail(
  candidate: Candidate,
  resume: Resume,
  evaluation: Evaluation | null,
  configVersion: number,
): CandidateDetailDto {
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
          configVersion,
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
