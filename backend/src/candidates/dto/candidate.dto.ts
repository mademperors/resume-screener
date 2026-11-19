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

export enum CandidateDecision {
  Pending = 'Pending',
  Approved = 'Approved',
  Rejected = 'Rejected',
}

export enum CandidateSortField {
  MatchScore = 'matchScore',
  Name = 'name',
  Experience = 'experience',
  Warnings = 'warnings',
  Status = 'status',
}

export class ListCandidatesQueryDto {
  @ApiPropertyOptional({
    type: [String],
    description: 'Comma-separated; candidate must have all of them.',
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

  @ApiPropertyOptional({ minimum: 0 })
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

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(({ value }: { value: unknown }) =>
    value === 'true' ? true : value === 'false' ? false : value,
  )
  @IsBoolean()
  hasWarnings?: boolean;

  @ApiPropertyOptional({
    enum: CandidateSortField,
    default: CandidateSortField.MatchScore,
  })
  @IsOptional()
  @IsEnum(CandidateSortField)
  sortBy: CandidateSortField = CandidateSortField.MatchScore;

  @ApiPropertyOptional({ enum: ['asc', 'desc'], default: 'desc' })
  @IsOptional()
  @IsIn(['asc', 'desc'])
  order: 'asc' | 'desc' = 'desc';

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
