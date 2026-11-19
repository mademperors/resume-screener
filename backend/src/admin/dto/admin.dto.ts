import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  ValidateIf,
} from 'class-validator';
import { CompanyPlan, type Company } from '../../companies/company.entity.js';
import type { CompanyPlanInfo } from '../../companies/company-plans.service.js';

export class SearchCompaniesQueryDto {
  @ApiPropertyOptional({ description: 'Part of the name or Google domain.' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  search?: string;

  @ApiPropertyOptional({ minimum: 1, maximum: 200, default: 50 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(200)
  limit = 50;
}

export class SetPlanDto {
  @ApiProperty({ enum: CompanyPlan })
  @IsEnum(CompanyPlan)
  plan: CompanyPlan;

  @ApiPropertyOptional({
    type: Number,
    nullable: true,
    minimum: 1,
    maximum: 100_000,
    description:
      "Requests per minute per API key instead of the plan's limit. null " +
      'removes a custom limit; omit to keep the current one.',
  })
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsInt()
  @Min(1)
  @Max(100_000)
  customRateLimitPerMinute?: number | null;
}

export class PlanLimitDto {
  @ApiProperty({ enum: CompanyPlan })
  plan: CompanyPlan;

  @ApiProperty()
  apiRateLimitPerMinute: number;
}

export class AdminCompanyDto {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiProperty()
  name: string;

  @ApiProperty({ type: String, nullable: true })
  googleDomain: string | null;

  @ApiProperty({ enum: CompanyPlan })
  plan: CompanyPlan;

  @ApiProperty({
    description: 'Requests per minute per API key that apply now.',
  })
  apiRateLimitPerMinute: number;

  @ApiProperty({ type: Number, nullable: true })
  customRateLimitPerMinute: number | null;

  @ApiProperty({ type: String, format: 'date-time' })
  createdAt: Date;

  static from(company: Company, plan: CompanyPlanInfo): AdminCompanyDto {
    return {
      id: company.id,
      name: company.name,
      googleDomain: company.googleDomain,
      ...plan,
      createdAt: company.createdAt,
    };
  }
}
