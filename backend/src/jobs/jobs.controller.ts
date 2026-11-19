import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOkResponse,
  ApiOperation,
  ApiSecurity,
  ApiTags,
} from '@nestjs/swagger';
import { CurrentPrincipal } from '../common/decorators.js';
import type { Principal } from '../common/principal.js';
import {
  CreateJobDto,
  JobDto,
  ListJobsQueryDto,
  UpdatedJobDto,
  UpdateJobDto,
} from './dto/job.dto.js';
import { JobStatus } from './job.entity.js';
import { JobsService } from './jobs.service.js';

@ApiTags('Jobs')
@ApiBearerAuth()
@ApiSecurity('api-key')
@Controller('jobs')
export class JobsController {
  constructor(private readonly jobs: JobsService) {}

  @Get()
  @ApiOperation({ summary: "List the company's jobs, newest first" })
  @ApiOkResponse({ type: [JobDto] })
  async list(
    @CurrentPrincipal() principal: Principal,
    @Query() query: ListJobsQueryDto,
  ): Promise<JobDto[]> {
    const jobs = await this.jobs.list(principal.companyId, query.status);
    return jobs.map(({ job, configVersion }) =>
      JobDto.from(job, configVersion),
    );
  }

  @Post()
  @ApiOperation({
    summary: 'Create a job with its requirements and screening filters',
  })
  async create(
    @CurrentPrincipal() principal: Principal,
    @Body() dto: CreateJobDto,
  ): Promise<JobDto> {
    const { job, configVersion } = await this.jobs.create(principal, dto);
    return JobDto.from(job, configVersion);
  }

  @Get(':jobId')
  @ApiOperation({ summary: 'Get a job' })
  async get(
    @CurrentPrincipal() principal: Principal,
    @Param('jobId', ParseUUIDPipe) jobId: string,
  ): Promise<JobDto> {
    const { job, configVersion } = await this.jobs.get(
      principal.companyId,
      jobId,
    );
    return JobDto.from(job, configVersion);
  }

  @Patch(':jobId')
  @ApiOperation({
    summary:
      'Update a job; requirement changes create a new scoring config version',
  })
  async update(
    @CurrentPrincipal() principal: Principal,
    @Param('jobId', ParseUUIDPipe) jobId: string,
    @Body() dto: UpdateJobDto,
  ): Promise<UpdatedJobDto> {
    const { job, configVersion, rescoreSuggested } = await this.jobs.update(
      principal.companyId,
      jobId,
      dto,
    );
    return Object.assign(JobDto.from(job, configVersion), {
      rescoreSuggested,
    });
  }

  @Delete(':jobId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete a job' })
  remove(
    @CurrentPrincipal() principal: Principal,
    @Param('jobId', ParseUUIDPipe) jobId: string,
  ): Promise<void> {
    return this.jobs.remove(principal.companyId, jobId);
  }

  @Post(':jobId/close')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Close a job; it stops accepting resumes' })
  async close(
    @CurrentPrincipal() principal: Principal,
    @Param('jobId', ParseUUIDPipe) jobId: string,
  ): Promise<JobDto> {
    const { job, configVersion } = await this.jobs.setStatus(
      principal.companyId,
      jobId,
      JobStatus.Closed,
    );
    return JobDto.from(job, configVersion);
  }

  @Post(':jobId/reopen')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Reopen a closed job' })
  async reopen(
    @CurrentPrincipal() principal: Principal,
    @Param('jobId', ParseUUIDPipe) jobId: string,
  ): Promise<JobDto> {
    const { job, configVersion } = await this.jobs.setStatus(
      principal.companyId,
      jobId,
      JobStatus.Open,
    );
    return JobDto.from(job, configVersion);
  }
}
