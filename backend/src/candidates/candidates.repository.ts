import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import {
  DataSource,
  In,
  type EntityManager,
  type SelectQueryBuilder,
} from 'typeorm';
import { normalizeSkill } from '../jobs/requirements.js';
import { Candidate, type CandidateDecision } from './candidate.entity.js';
import {
  CandidateSortField,
  type CandidateFiltersDto,
} from './dto/candidate.dto.js';

const SORT_COLUMNS: Record<CandidateSortField, string> = {
  [CandidateSortField.MatchScore]: 'candidate.matchScore',
  [CandidateSortField.Name]: 'candidate.fullName',
  [CandidateSortField.Experience]: 'candidate.experienceYears',
  [CandidateSortField.Warnings]: 'warning_count',
  [CandidateSortField.Status]: 'candidate.decision',
};

/** The candidate fields the pipeline writes after each evaluation. */
export type CandidateResult = Omit<
  Candidate,
  | 'id'
  | 'decision'
  | 'latestEvaluationId'
  | 'createdAt'
  | 'updatedAt'
  | 'company'
  | 'job'
  | 'resume'
>;

/** Database access for candidates. Methods that take `tx` join the caller's transaction. */
@Injectable()
export class CandidatesRepository {
  constructor(@InjectDataSource() private readonly db: DataSource) {}

  findById(id: string): Promise<Candidate | null> {
    return this.candidates().findOneBy({ id });
  }

  /** One page of the job's candidates matching the filters, in display order. */
  findPage(
    jobId: string,
    filters: CandidateFiltersDto,
    page: { page: number; pageSize: number },
  ): Promise<[Candidate[], number]> {
    return this.filtered(jobId, filters)
      .skip((page.page - 1) * page.pageSize)
      .take(page.pageSize)
      .getManyAndCount();
  }

  /** A slice of the filtered list in display order, e.g. for an export. */
  findSlice(
    jobId: string,
    filters: CandidateFiltersDto,
    offset: number,
    limit: number,
  ): Promise<Candidate[]> {
    return this.filtered(jobId, filters).skip(offset).take(limit).getMany();
  }

  /** The best candidates at or above the job's minimum score. */
  findTop(jobId: string, filters: CandidateFiltersDto, limit: number) {
    return this.filtered(jobId, filters)
      .andWhere('candidate.belowThreshold = false')
      .take(limit)
      .getMany();
  }

  async setDecision(id: string, decision: CandidateDecision): Promise<void> {
    await this.candidates().update(id, { decision });
  }

  /** Candidate ids by resume id, for the given resumes that have one. */
  async idsByResume(
    resumeIds: readonly string[],
  ): Promise<Map<string, string>> {
    if (resumeIds.length === 0) {
      return new Map();
    }
    const rows = await this.candidates().find({
      where: { resumeId: In([...resumeIds]) },
      select: { id: true, resumeId: true },
    });
    return new Map(rows.map((c) => [c.resumeId, c.id]));
  }

  /**
   * Creates or updates the candidate of a resume. A re-score updates the
   * same candidate and keeps the recruiter's decision.
   */
  async saveResult(
    result: CandidateResult,
    tx: EntityManager,
  ): Promise<Candidate> {
    const candidates = this.candidates(tx);
    await candidates.upsert(result, { conflictPaths: ['resumeId'] });
    return candidates.findOneByOrFail({ resumeId: result.resumeId });
  }

  async setLatestEvaluation(
    id: string,
    evaluationId: string,
    tx: EntityManager,
  ): Promise<void> {
    await this.candidates(tx).update(id, { latestEvaluationId: evaluationId });
  }

  /** Moves the job's candidates between the main list and the below-minimum section. */
  async refreshBelowThreshold(
    jobId: string,
    minMatchScore: number,
    tx?: EntityManager,
  ): Promise<void> {
    await this.candidates(tx)
      .createQueryBuilder()
      .update(Candidate)
      .set({
        belowThreshold: () =>
          '("matchScore" IS NOT NULL AND "matchScore" < :minMatchScore)',
      })
      .where('jobId = :jobId', { jobId })
      .setParameters({ minMatchScore })
      .execute();
  }

  /** Candidates below the job's minimum score last, then the chosen sort. */
  private filtered(
    jobId: string,
    filters: CandidateFiltersDto,
  ): SelectQueryBuilder<Candidate> {
    const query = this.candidates()
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

  private candidates(tx?: EntityManager) {
    return (tx ?? this.db.manager).getRepository(Candidate);
  }
}
