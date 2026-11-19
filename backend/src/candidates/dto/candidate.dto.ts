import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsEnum,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  Min,
} from 'class-validator';
import { CandidateDecision } from '../candidate.entity.js';
import { CandidateFlag } from '../evaluation.types.js';

export enum CandidateSortField {
  MatchScore = 'matchScore',
  Name = 'name',
  Experience = 'experience',
  Warnings = 'warnings',
  Status = 'status',
}

/** Filters shared by the list, the CSV export and the report. */
export class CandidateFiltersDto {
  @ApiPropertyOptional({
    type: [String],
    description: 'Comma-separated; the candidate must have all of them.',
    example: 'TypeScript,PostgreSQL',
  })
  @IsOptional()
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string'
      ? value
          .split(',')
          .map((skill) => skill.trim())
          .filter(Boolean)
      : value,
  )
  @IsArray()
  @IsString({ each: true })
  skills?: string[];

  @ApiPropertyOptional({ minimum: 0, description: 'Years.' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  minExperience?: number;

  @ApiPropertyOptional({ minimum: 0, maximum: 100 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(100)
  minScore?: number;

  @ApiPropertyOptional({
    description: 'true: only flagged candidates; false: only unflagged.',
  })
  @IsOptional()
  @Transform(({ value }: { value: unknown }) =>
    value === 'true' ? true : value === 'false' ? false : value,
  )
  @IsBoolean()
  hasWarnings?: boolean;

  @ApiPropertyOptional({ enum: CandidateDecision })
  @IsOptional()
  @IsEnum(CandidateDecision)
  status?: CandidateDecision;

  @ApiPropertyOptional({
    enum: CandidateSortField,
    default: CandidateSortField.MatchScore,
    description:
      'Candidates below the job minimum score always come after the others.',
  })
  @IsOptional()
  @IsEnum(CandidateSortField)
  sortBy: CandidateSortField = CandidateSortField.MatchScore;

  @ApiPropertyOptional({ enum: ['asc', 'desc'], default: 'desc' })
  @IsOptional()
  @IsIn(['asc', 'desc'])
  order: 'asc' | 'desc' = 'desc';
}

export class ListCandidatesQueryDto extends CandidateFiltersDto {
  @ApiPropertyOptional({ minimum: 1, default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page = 1;

  @ApiPropertyOptional({ minimum: 1, maximum: 200, default: 50 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(200)
  pageSize = 50;
}

export class UpdateCandidateStatusDto {
  @ApiProperty({ enum: CandidateDecision })
  @IsEnum(CandidateDecision)
  status: CandidateDecision;
}

export class CandidateSummaryDto {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiProperty({ format: 'uuid' })
  resumeId: string;

  @ApiProperty({ type: String, nullable: true })
  name: string | null;

  @ApiProperty({ type: Number, nullable: true, minimum: 0, maximum: 100 })
  matchScore: number | null;

  @ApiProperty({ type: Number, nullable: true, description: 'Years.' })
  experienceYears: number | null;

  @ApiProperty({ type: [String] })
  keySkills: string[];

  @ApiProperty({ enum: CandidateFlag, isArray: true })
  warnings: CandidateFlag[];

  @ApiProperty({ enum: CandidateDecision })
  status: CandidateDecision;

  @ApiProperty({
    description: 'Below the job minimum score; shown separately at the bottom.',
  })
  belowThreshold: boolean;

  @ApiProperty({ type: String, format: 'date-time' })
  evaluatedAt: Date;
}

export class CandidatePageDto {
  @ApiProperty({ type: [CandidateSummaryDto] })
  items: CandidateSummaryDto[];

  @ApiProperty({ description: 'Candidates matching the filters.' })
  total: number;

  @ApiProperty()
  page: number;

  @ApiProperty()
  pageSize: number;

  @ApiProperty({ description: "The job's minimum match score." })
  minMatchScore: number;
}

export class ContactsDto {
  @ApiProperty({ type: String, nullable: true })
  name: string | null;

  @ApiProperty({ type: String, nullable: true })
  email: string | null;

  @ApiProperty({ type: String, nullable: true })
  phone: string | null;

  @ApiProperty({ type: String, nullable: true })
  location: string | null;
}

export class RequirementResultDto {
  @ApiProperty({ example: 'skill:typescript' })
  requirementId: string;

  @ApiProperty({ example: 'TypeScript' })
  label: string;

  @ApiProperty()
  mandatory: boolean;

  @ApiProperty()
  met: boolean;

  @ApiProperty({ minimum: 0, maximum: 1 })
  confidence: number;

  @ApiProperty({ description: 'Points this requirement added to the score.' })
  points: number;

  @ApiProperty({ description: 'Points it could add at most.' })
  maxPoints: number;

  @ApiProperty({ type: String, nullable: true })
  evidence: string | null;
}

export class EvaluationInfoDto {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiProperty({ description: 'Scoring config version used.' })
  configVersion: number;

  @ApiProperty()
  modelName: string;

  @ApiProperty()
  modelVersion: string;

  @ApiProperty({ type: String, format: 'date-time' })
  evaluatedAt: Date;
}

export class ResumeInfoDto {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiProperty()
  filename: string;

  @ApiProperty()
  sizeBytes: number;

  @ApiProperty({ type: String, format: 'date-time' })
  uploadedAt: Date;
}

export class CandidateDetailDto {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiProperty({ format: 'uuid' })
  jobId: string;

  @ApiProperty({ type: ContactsDto })
  contacts: ContactsDto;

  @ApiProperty({ type: Number, nullable: true })
  matchScore: number | null;

  @ApiProperty({ type: Number, nullable: true })
  experienceYears: number | null;

  @ApiProperty()
  belowThreshold: boolean;

  @ApiProperty({ type: [String] })
  foundSkills: string[];

  @ApiProperty({ type: [String] })
  missingSkills: string[];

  @ApiProperty({
    type: [RequirementResultDto],
    description: "Each requirement's verdict and contribution to the score.",
  })
  requirements: RequirementResultDto[];

  @ApiProperty({ enum: CandidateFlag, isArray: true })
  warnings: CandidateFlag[];

  @ApiProperty({ type: [String], description: 'Why warnings were raised.' })
  warningDetails: string[];

  @ApiProperty({ enum: CandidateDecision })
  status: CandidateDecision;

  @ApiProperty({ type: EvaluationInfoDto, nullable: true })
  evaluation: EvaluationInfoDto | null;

  @ApiProperty({ type: ResumeInfoDto })
  resume: ResumeInfoDto;
}

export class DownloadLinkDto {
  @ApiProperty({
    description: 'Opens the original file; works until expiresAt.',
  })
  url: string;

  @ApiProperty({ type: String, format: 'date-time' })
  expiresAt: Date;
}
