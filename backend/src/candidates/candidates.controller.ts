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
  Query,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiProduces,
  ApiSecurity,
  ApiTags,
} from '@nestjs/swagger';
import { CurrentPrincipal } from '../common/decorators.js';
import type { Principal } from '../common/principal.js';
import {
  ListCandidatesQueryDto,
  UpdateCandidateStatusDto,
} from './dto/candidate.dto.js';

// TODO(3.5): implement with candidates/evaluations, scoped to principal.companyId.
@ApiTags('Candidates')
@ApiBearerAuth()
@ApiSecurity('api-key')
@Controller()
export class CandidatesController {
  @Get('jobs/:jobId/candidates')
  @ApiOperation({
    summary:
      'Ranked, filterable candidate list (below-threshold candidates last)',
  })
  list(
    @CurrentPrincipal() _principal: Principal,
    @Param('jobId', ParseUUIDPipe) _jobId: string,
    @Query() _query: ListCandidatesQueryDto,
  ) {
    throw new NotImplementedException();
  }

  @Get('jobs/:jobId/candidates/export.csv')
  @ApiProduces('text/csv')
  @ApiOperation({ summary: 'Export the filtered candidate list as CSV' })
  exportCsv(
    @CurrentPrincipal() _principal: Principal,
    @Param('jobId', ParseUUIDPipe) _jobId: string,
    @Query() _query: ListCandidatesQueryDto,
  ) {
    throw new NotImplementedException();
  }

  @Get('jobs/:jobId/report')
  @ApiOperation({ summary: 'Summary report for a job, for printing' })
  report(
    @CurrentPrincipal() _principal: Principal,
    @Param('jobId', ParseUUIDPipe) _jobId: string,
  ) {
    throw new NotImplementedException();
  }

  @Get('candidates/:candidateId')
  @ApiOperation({
    summary:
      'Candidate card: score, found/missing skills, requirement contributions, warnings',
  })
  get(
    @CurrentPrincipal() _principal: Principal,
    @Param('candidateId', ParseUUIDPipe) _candidateId: string,
  ) {
    throw new NotImplementedException();
  }

  @Patch('candidates/:candidateId/status')
  @ApiOperation({ summary: 'Set the decision: Approved, Rejected or Pending' })
  updateStatus(
    @CurrentPrincipal() _principal: Principal,
    @Param('candidateId', ParseUUIDPipe) _candidateId: string,
    @Body() _dto: UpdateCandidateStatusDto,
  ) {
    throw new NotImplementedException();
  }

  @Get('candidates/:candidateId/resume-file')
  @ApiOperation({ summary: 'Short-lived link to the original resume file' })
  resumeFile(
    @CurrentPrincipal() _principal: Principal,
    @Param('candidateId', ParseUUIDPipe) _candidateId: string,
  ) {
    throw new NotImplementedException();
  }

  @Delete('candidates/:candidateId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Delete a candidate with their resume and evaluations',
  })
  remove(
    @CurrentPrincipal() _principal: Principal,
    @Param('candidateId', ParseUUIDPipe) _candidateId: string,
  ) {
    throw new NotImplementedException();
  }
}
