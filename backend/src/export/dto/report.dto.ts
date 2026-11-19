import { ApiProperty } from '@nestjs/swagger';
import { CandidateSummaryDto } from '../../candidates/dto/candidate.dto.js';
import { JobDto } from '../../jobs/dto/job.dto.js';
import { ProgressDto } from '../../resumes/dto/resume.dto.js';

export class ScoreBucketDto {
  @ApiProperty({ example: 80 })
  from: number;

  @ApiProperty({
    example: 100,
    description: 'Inclusive only for the last bucket.',
  })
  to: number;

  @ApiProperty()
  count: number;
}

export class DecisionCountsDto {
  @ApiProperty()
  Pending: number;

  @ApiProperty()
  Approved: number;

  @ApiProperty()
  Rejected: number;
}

export class CandidateStatsDto {
  @ApiProperty()
  total: number;

  @ApiProperty({ description: 'At or above the job minimum score.' })
  aboveThreshold: number;

  @ApiProperty()
  belowThreshold: number;

  @ApiProperty()
  withWarnings: number;

  @ApiProperty({ type: Number, nullable: true })
  averageScore: number | null;

  @ApiProperty({ type: DecisionCountsDto })
  byDecision: DecisionCountsDto;

  @ApiProperty({ type: [ScoreBucketDto] })
  scoreDistribution: ScoreBucketDto[];
}

export class RequirementCoverageDto {
  @ApiProperty()
  requirementId: string;

  @ApiProperty()
  label: string;

  @ApiProperty()
  mandatory: boolean;

  @ApiProperty({ description: 'Candidates meeting this requirement.' })
  met: number;

  @ApiProperty({ description: 'Share of evaluated candidates, 0..1.' })
  share: number;
}

export class JobReportDto {
  @ApiProperty({ type: JobDto })
  job: JobDto;

  @ApiProperty({ type: String, format: 'date-time' })
  generatedAt: Date;

  @ApiProperty({ type: ProgressDto })
  processing: ProgressDto;

  @ApiProperty({ type: CandidateStatsDto })
  candidates: CandidateStatsDto;

  @ApiProperty({
    type: [RequirementCoverageDto],
    description:
      "How many candidates meet each of the job's current requirements.",
  })
  requirements: RequirementCoverageDto[];

  @ApiProperty({
    type: [CandidateSummaryDto],
    description: 'Best candidates at or above the minimum score.',
  })
  topCandidates: CandidateSummaryDto[];
}
