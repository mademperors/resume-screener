import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import {
  ArrayNotEmpty,
  IsArray,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

export class CreateJobDto {
  @ApiProperty({ example: 'Senior Backend Engineer' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  title: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  @MaxLength(20_000)
  description: string;

  @ApiProperty({ type: [String], example: ['TypeScript', 'PostgreSQL'] })
  @IsArray()
  @ArrayNotEmpty()
  @IsString({ each: true })
  @IsNotEmpty({ each: true })
  requiredSkills: string[];

  @ApiPropertyOptional({ type: [String], example: ['Docker'] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @IsNotEmpty({ each: true })
  preferredSkills?: string[];

  @ApiProperty({ minimum: 0, example: 3 })
  @IsNumber()
  @Min(0)
  minExperienceYears: number;

  @ApiPropertyOptional({
    minimum: 0,
    maximum: 100,
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
