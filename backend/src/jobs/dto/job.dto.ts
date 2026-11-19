import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayNotEmpty,
  IsArray,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { JobStatus, type Job } from '../job.entity.js';

const trim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;
const trimEach = ({ value }: { value: unknown }) =>
  Array.isArray(value)
    ? value.map((item) => (typeof item === 'string' ? item.trim() : item))
    : value;

export const MAX_SKILLS_PER_LIST = 50;

export class CreateJobDto {
  @ApiProperty({ example: 'Senior Backend Engineer', maxLength: 200 })
  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  title: string;

  @ApiProperty({ maxLength: 20_000 })
  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(20_000)
  description: string;

  @ApiProperty({
    type: [String],
    example: ['TypeScript', 'PostgreSQL'],
    description:
      'Mandatory skills. A candidate without one is marked "Does not meet requirements".',
  })
  @Transform(trimEach)
  @IsArray()
  @ArrayNotEmpty()
  @ArrayMaxSize(MAX_SKILLS_PER_LIST)
  @IsString({ each: true })
  @IsNotEmpty({ each: true })
  @MaxLength(100, { each: true })
  requiredSkills: string[];

  @ApiPropertyOptional({ type: [String], example: ['Docker'] })
  @IsOptional()
  @Transform(trimEach)
  @IsArray()
  @ArrayMaxSize(MAX_SKILLS_PER_LIST)
  @IsString({ each: true })
  @IsNotEmpty({ each: true })
  @MaxLength(100, { each: true })
  preferredSkills?: string[];

  @ApiProperty({ minimum: 0, maximum: 60, example: 3 })
  @IsNumber({ maxDecimalPlaces: 1 })
  @Min(0)
  @Max(60)
  minExperienceYears: number;

  @ApiPropertyOptional({
    minimum: 0,
    maximum: 100,
    default: 0,
    description:
      'Candidates scoring below this are shown at the bottom of the list.',
  })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(100)
  minMatchScore?: number;
}

export class UpdateJobDto extends PartialType(CreateJobDto) {}

export class ListJobsQueryDto {
  @ApiPropertyOptional({ enum: JobStatus })
  @IsOptional()
  @IsEnum(JobStatus)
  status?: JobStatus;
}

export class JobDto {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiProperty()
  title: string;

  @ApiProperty()
  description: string;

  @ApiProperty({ type: [String] })
  requiredSkills: string[];

  @ApiProperty({ type: [String] })
  preferredSkills: string[];

  @ApiProperty()
  minExperienceYears: number;

  @ApiProperty({ minimum: 0, maximum: 100 })
  minMatchScore: number;

  @ApiProperty({ enum: JobStatus })
  status: JobStatus;

  @ApiProperty({ type: String, format: 'date-time', nullable: true })
  closedAt: Date | null;

  @ApiProperty({
    description:
      'Version of the scoring config; increases when requirements change.',
    example: 1,
  })
  configVersion: number;

  @ApiProperty({ type: String, format: 'date-time' })
  createdAt: Date;

  @ApiProperty({ type: String, format: 'date-time' })
  updatedAt: Date;

  static from(job: Job, configVersion: number): JobDto {
    return {
      id: job.id,
      title: job.title,
      description: job.description,
      requiredSkills: job.requiredSkills,
      preferredSkills: job.preferredSkills,
      minExperienceYears: job.minExperienceYears,
      minMatchScore: job.minMatchScore,
      status: job.status,
      closedAt: job.closedAt,
      configVersion,
      createdAt: job.createdAt,
      updatedAt: job.updatedAt,
    };
  }
}

export class UpdatedJobDto extends JobDto {
  @ApiProperty({
    description:
      'True when the requirements changed and the job already has resumes. ' +
      'Offer to re-score them with POST /jobs/{jobId}/rescore.',
  })
  rescoreSuggested: boolean;
}
