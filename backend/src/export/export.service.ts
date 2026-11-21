import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { CandidateDecision } from '../candidates/candidate.entity.js';
import {
  CandidatesService,
  toSummary,
} from '../candidates/candidates.service.js';
import { CandidateFiltersDto } from '../candidates/dto/candidate.dto.js';
import { JobDto } from '../jobs/dto/job.dto.js';
import type { Job } from '../jobs/job.entity.js';
import { JobsService } from '../jobs/jobs.service.js';
import { ResumesService } from '../resumes/resumes.service.js';
import { CSV_BOM, csvLine } from './csv.js';
import type {
  CandidateStatsDto,
  JobReportDto,
  RequirementCoverageDto,
} from './dto/report.dto.js';

/** More than any job realistically has; bounds one export's work. */
export const MAX_EXPORT_ROWS = 10_000;
const BATCH_SIZE = 500;
const TOP_CANDIDATES = 10;
const BUCKETS = [0, 20, 40, 60, 80, 100];

const CSV_HEADER = [
  'Rank',
  'Name',
  'Email',
  'Phone',
  'Match score',
  'Experience (years)',
  'Key skills',
  'Missing skills',
  'Warnings',
  'Status',
  'Below minimum score',
];

@Injectable()
export class ExportService {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly jobs: JobsService,
    private readonly candidates: CandidatesService,
    private readonly resumes: ResumesService,
  ) {}

  /** Checks access before anything is streamed, so errors are proper responses. */
  getJob(companyId: string, jobId: string): Promise<Job> {
    return this.jobs.getOwned(companyId, jobId);
  }

  /** The filtered list in display order, as CSV lines, fetched in batches. */
  async *csv(job: Job, filters: CandidateFiltersDto): AsyncGenerator<string> {
    yield CSV_BOM + csvLine(CSV_HEADER);
    let rank = 0;
    for (let offset = 0; offset < MAX_EXPORT_ROWS; offset += BATCH_SIZE) {
      const batch = await this.candidates
        .filteredQuery(job.id, filters)
        .skip(offset)
        .take(Math.min(BATCH_SIZE, MAX_EXPORT_ROWS - offset))
        .getMany();
      for (const candidate of batch) {
        rank += 1;
        yield csvLine([
          rank,
          candidate.fullName,
          candidate.email,
          candidate.phone,
          candidate.matchScore,
          candidate.experienceYears,
          candidate.skills.join('; '),
          candidate.missingSkills.join('; '),
          candidate.flags.join('; '),
          candidate.decision,
          candidate.belowThreshold ? 'Yes' : 'No',
        ]);
      }
      if (batch.length < BATCH_SIZE) {
        return;
      }
    }
  }

  async report(companyId: string, jobId: string): Promise<JobReportDto> {
    const { job, configVersion } = await this.jobs.get(companyId, jobId);
    const [processing, stats, requirements, top] = await Promise.all([
      this.resumes.progress(companyId, jobId),
      this.stats(job.id),
      this.coverage(job),
      this.candidates
        .filteredQuery(job.id, new CandidateFiltersDto())
        .andWhere('candidate.belowThreshold = false')
        .take(TOP_CANDIDATES)
        .getMany(),
    ]);
    return {
      job: JobDto.from(job, configVersion),
      generatedAt: new Date(),
      processing,
      candidates: stats,
      requirements,
      topCandidates: top.map(toSummary),
    };
  }

  private async stats(jobId: string): Promise<CandidateStatsDto> {
    const bucketColumns = BUCKETS.slice(0, -1).map((from, index) => {
      const to = BUCKETS[index + 1];
      const upper = to === 100 ? '<= 100' : `< ${to}`;
      return `COUNT(*) FILTER (WHERE "matchScore" >= ${from} AND "matchScore" ${upper})::int AS "bucket_${from}"`;
    });
    const [row] = await this.dataSource.query<
      Record<string, number | string | null>[]
    >(
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
        Pending: Number(row.pending),
        Approved: Number(row.approved),
        Rejected: Number(row.rejected),
      },
      scoreDistribution: BUCKETS.slice(0, -1).map((from, index) => ({
        from,
        to: BUCKETS[index + 1],
        count: Number(row[`bucket_${from}`]),
      })),
    };
  }

  /** For each current requirement, how many candidates' latest evaluation meets it. */
  private async coverage(job: Job): Promise<RequirementCoverageDto[]> {
    const config = await this.jobs.getCurrentConfig(job);
    const rows = await this.dataSource.query<
      { requirementId: string; met: number; evaluated: number }[]
    >(
      `SELECT item->>'requirementId' AS "requirementId",
              COUNT(*) FILTER (WHERE (item->>'met')::boolean)::int AS met,
              COUNT(*)::int AS evaluated
       FROM candidates c
       JOIN evaluations e ON e.id = c."latestEvaluationId"
       CROSS JOIN jsonb_array_elements(e.contributions) AS item
       WHERE c."jobId" = $1
       GROUP BY 1`,
      [job.id],
    );
    const [{ total }] = await this.dataSource.query<{ total: number }[]>(
      `SELECT COUNT(*)::int AS total FROM candidates WHERE "jobId" = $1 AND "latestEvaluationId" IS NOT NULL`,
      [job.id],
    );
    const byId = new Map(rows.map((row) => [row.requirementId, row]));
    return config.requirements.map((requirement) => {
      const met = byId.get(requirement.id)?.met ?? 0;
      return {
        requirementId: requirement.id,
        label: requirement.label,
        mandatory: requirement.mandatory,
        met,
        share: total > 0 ? Math.round((met / total) * 100) / 100 : 0,
      };
    });
  }
}
