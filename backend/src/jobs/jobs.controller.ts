import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  NotImplementedException,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiSecurity,
  ApiTags,
} from '@nestjs/swagger';
import { CurrentPrincipal } from '../common/decorators.js';
import type { Principal } from '../common/principal.js';
import { CreateJobDto, UpdateJobDto } from './dto/job.dto.js';

// TODO(3.5): implement with the jobs repository, scoped to principal.companyId.
@ApiTags('Jobs')
@ApiBearerAuth()
@ApiSecurity('api-key')
@Controller('jobs')
export class JobsController {
  @Get()
  @ApiOperation({ summary: "List the company's jobs" })
  list(@CurrentPrincipal() _principal: Principal) {
    throw new NotImplementedException();
  }

  @Post()
  @ApiOperation({
    summary: 'Create a job with its requirements and screening filters',
  })
  create(
    @CurrentPrincipal() _principal: Principal,
    @Body() _dto: CreateJobDto,
  ) {
    throw new NotImplementedException();
  }

  @Get(':jobId')
  @ApiOperation({ summary: 'Get a job' })
  get(
    @CurrentPrincipal() _principal: Principal,
    @Param('jobId', ParseUUIDPipe) _jobId: string,
  ) {
    throw new NotImplementedException();
  }

  @Patch(':jobId')
  @ApiOperation({
    summary: 'Update a job; changes create a new scoring config version',
  })
  update(
    @CurrentPrincipal() _principal: Principal,
    @Param('jobId', ParseUUIDPipe) _jobId: string,
    @Body() _dto: UpdateJobDto,
  ) {
    throw new NotImplementedException();
  }

  @Delete(':jobId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete a job' })
  remove(
    @CurrentPrincipal() _principal: Principal,
    @Param('jobId', ParseUUIDPipe) _jobId: string,
  ) {
    throw new NotImplementedException();
  }

  @Post(':jobId/rescore')
  @HttpCode(HttpStatus.ACCEPTED)
  @ApiOperation({
    summary: "Re-score the job's candidates after its requirements changed",
  })
  rescore(
    @CurrentPrincipal() _principal: Principal,
    @Param('jobId', ParseUUIDPipe) _jobId: string,
  ) {
    throw new NotImplementedException();
  }
}
