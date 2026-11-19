import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsEnum, IsIn, IsInt, IsOptional, Max, Min } from 'class-validator';
import { ResumeStatus, type Resume } from '../resume.entity.js';

export type DuplicateHandling = 'skip' | 'keep';

export class UploadResumesQueryDto {
  @ApiPropertyOptional({
    enum: ['skip', 'keep'],
    default: 'skip',
    description:
      'What to do with a file already uploaded to this job: skip it (and ' +
      'report it as a duplicate) or upload it again.',
  })
  @IsOptional()
  @IsIn(['skip', 'keep'])
  onDuplicate: DuplicateHandling = 'skip';
}

export type FileUploadStatus = 'accepted' | 'rejected' | 'duplicate';

export class FileUploadResultDto {
  @ApiProperty({ example: 'jane-doe.pdf' })
  filename: string;

  @ApiProperty({ enum: ['accepted', 'rejected', 'duplicate'] })
  status: FileUploadStatus;

  @ApiPropertyOptional({ format: 'uuid', description: 'Set when accepted.' })
  resumeId?: string;

  @ApiPropertyOptional({
    format: 'uuid',
    description: 'Set for duplicates: the resume already uploaded.',
  })
  duplicateOfResumeId?: string;

  @ApiPropertyOptional({
    example: 'File is too large (max 10 MB).',
    description: 'Why the file was rejected or skipped.',
  })
  reason?: string;
}

export class UploadResultDto {
  @ApiProperty({
    type: [FileUploadResultDto],
    description: 'One entry per file, in upload order.',
  })
  results: FileUploadResultDto[];

  @ApiProperty()
  accepted: number;

  @ApiProperty()
  rejected: number;

  @ApiProperty()
  duplicates: number;
}

export class ListResumesQueryDto {
  @ApiPropertyOptional({ enum: ResumeStatus })
  @IsOptional()
  @IsEnum(ResumeStatus)
  status?: ResumeStatus;

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

export class ResumeDto {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiProperty({ format: 'uuid' })
  jobId: string;

  @ApiProperty()
  filename: string;

  @ApiProperty()
  sizeBytes: number;

  @ApiProperty({ enum: ResumeStatus })
  status: ResumeStatus;

  @ApiProperty({ description: 'Processing attempts so far.' })
  attempts: number;

  @ApiProperty({
    type: String,
    nullable: true,
    description: 'Readable reason for the last failure.',
  })
  lastError: string | null;

  @ApiProperty({ type: String, format: 'date-time' })
  uploadedAt: Date;

  @ApiProperty({ type: String, format: 'date-time', nullable: true })
  processedAt: Date | null;

  static from(resume: Resume): ResumeDto {
    return {
      id: resume.id,
      jobId: resume.jobId,
      filename: resume.originalFilename,
      sizeBytes: resume.sizeBytes,
      status: resume.status,
      attempts: resume.attempts,
      lastError: resume.lastError,
      uploadedAt: resume.createdAt,
      processedAt: resume.processedAt,
    };
  }
}

export class ResumePageDto {
  @ApiProperty({ type: [ResumeDto] })
  items: ResumeDto[];

  @ApiProperty()
  total: number;

  @ApiProperty()
  page: number;

  @ApiProperty()
  pageSize: number;
}

export class RequeueResultDto {
  @ApiProperty({ description: 'Resumes queued for processing again.' })
  queued: number;
}
