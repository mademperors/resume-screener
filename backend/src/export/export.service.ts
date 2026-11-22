import { Injectable } from '@nestjs/common';
import { CandidateReportsRepository } from '../candidates/candidate-reports.repository.js';
import { CandidatesRepository } from '../candidates/candidates.repository.js';
import { toSummary } from '../candidates/candidates.service.js';
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

/** CSV export of the candidate list and the printable job report. Read-only. */
@Injectable()
export class ExportService {
  constructor(
    private readonly jobs: JobsService,
    private readonly resumes: ResumesService,
    private readonly candidates: CandidatesRepository,
    private readonly reports: CandidateReportsRepository,
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
      const batch = await this.candidates.findSlice(
        job.id,
        filters,
        offset,
        Math.min(BATCH_SIZE, MAX_EXPORT_ROWS - offset),
      );
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
      this.candidates.findTop(
        job.id,
        new CandidateFiltersDto(),
        TOP_CANDIDATES,
      ),
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
    const counts = await this.reports.countCandidates(jobId, BUCKETS);
    return {
      total: counts.total,
      aboveThreshold: counts.aboveThreshold,
      belowThreshold: counts.belowThreshold,
      withWarnings: counts.withWarnings,
      averageScore: counts.averageScore,
      byDecision: counts.byDecision,
      scoreDistribution: BUCKETS.slice(0, -1).map((from, index) => ({
        from,
        to: BUCKETS[index + 1],
        count: counts.buckets[index],
      })),
    };
  }

  /** For each current requirement, the share of evaluated candidates who meet it. */
  private async coverage(job: Job): Promise<RequirementCoverageDto[]> {
    const [config, coverage] = await Promise.all([
      this.jobs.getCurrentConfig(job),
      this.reports.requirementCoverage(job.id),
    ]);
    const metById = new Map(
      coverage.met.map((row) => [row.requirementId, row.met]),
    );
    return config.requirements.map((requirement) => {
      const met = metById.get(requirement.id) ?? 0;
      return {
        requirementId: requirement.id,
        label: requirement.label,
        mandatory: requirement.mandatory,
        met,
        share:
          coverage.evaluated > 0
            ? Math.round((met / coverage.evaluated) * 100) / 100
            : 0,
      };
    });
  }
}
