import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { CandidateDecision } from './candidate.entity.js';

/** Counters behind the job report. */
export interface CandidateCounts {
  total: number;
  aboveThreshold: number;
  belowThreshold: number;
  withWarnings: number;
  averageScore: number | null;
  byDecision: Record<CandidateDecision, number>;
  /** Candidates per score bucket, in the order of the given bounds. */
  buckets: number[];
}

export interface RequirementMetCount {
  requirementId: string;
  met: number;
}

/** Read-only aggregates over a job's candidates and their latest evaluations. */
@Injectable()
export class CandidateReportsRepository {
  constructor(@InjectDataSource() private readonly db: DataSource) {}

  /**
   * Counts of the job's candidates: in total, by section, with warnings, by
   * decision, and per score bucket. `bounds` like [0, 20, ..., 100]; the
   * last bucket includes its upper bound.
   */
  async countCandidates(
    jobId: string,
    bounds: readonly number[],
  ): Promise<CandidateCounts> {
    const last = bounds.length - 2;
    const bucketColumns = bounds.slice(0, -1).map((from, index) => {
      const to = Number(bounds[index + 1]);
      const upper = index === last ? `<= ${to}` : `< ${to}`;
      return `COUNT(*) FILTER (WHERE "matchScore" >= ${Number(from)} AND "matchScore" ${upper})::int AS "bucket_${index}"`;
    });
    const [row] = await this.db.query<Record<string, number | null>[]>(
      `SELECT
         COUNT(*)::int AS total,
         COUNT(*) FILTER (WHERE NOT "belowThreshold")::int AS above,
         COUNT(*) FILTER (WHERE "belowThreshold")::int AS below,
         COUNT(*) FILTER (WHERE cardinality(flags) > 0)::int AS warnings,
         ROUND(AVG("matchScore"), 2)::float AS average,
         COUNT(*) FILTER (WHERE decision = $2)::int AS pending,
         COUNT(*) FILTER (WHERE decision = $3)::int AS approved,
         COUNT(*) FILTER (WHERE decision = $4)::int AS rejected,
         ${bucketColumns.join(',\n')}
       FROM candidates WHERE "jobId" = $1`,
      [
        jobId,
        CandidateDecision.Pending,
        CandidateDecision.Approved,
        CandidateDecision.Rejected,
      ],
    );
    return {
      total: Number(row.total),
      aboveThreshold: Number(row.above),
      belowThreshold: Number(row.below),
      withWarnings: Number(row.warnings),
      averageScore: row.average === null ? null : Number(row.average),
      byDecision: {
        [CandidateDecision.Pending]: Number(row.pending),
        [CandidateDecision.Approved]: Number(row.approved),
        [CandidateDecision.Rejected]: Number(row.rejected),
      },
      buckets: bounds
        .slice(0, -1)
        .map((_, index) => Number(row[`bucket_${index}`])),
    };
  }

  /**
   * For each requirement, how many of the job's candidates meet it in their
   * latest evaluation, and how many candidates have been evaluated at all.
   */
  async requirementCoverage(
    jobId: string,
  ): Promise<{ evaluated: number; met: RequirementMetCount[] }> {
    const met = await this.db.query<RequirementMetCount[]>(
      `SELECT item->>'requirementId' AS "requirementId",
              COUNT(*) FILTER (WHERE (item->>'met')::boolean)::int AS met
       FROM candidates c
       JOIN evaluations e ON e.id = c."latestEvaluationId"
       CROSS JOIN jsonb_array_elements(e.contributions) AS item
       WHERE c."jobId" = $1
       GROUP BY 1`,
      [jobId],
    );
    const [{ total }] = await this.db.query<{ total: number }[]>(
      `SELECT COUNT(*)::int AS total FROM candidates WHERE "jobId" = $1 AND "latestEvaluationId" IS NOT NULL`,
      [jobId],
    );
    return { evaluated: total, met };
  }
}
