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
  ApiNoContentResponse,
  ApiOkResponse,
  ApiOperation,
  ApiProduces,
  ApiSecurity,
  ApiTags,
} from '@nestjs/swagger';
import { CurrentPrincipal } from '../common/decorators.js';
import type { Principal } from '../common/principal.js';
import { CandidatesService, toSummary } from './candidates.service.js';
import {
  CandidateDetailDto,
  CandidateFiltersDto,
  CandidatePageDto,
  DownloadLinkDto,
  ListCandidatesQueryDto,
  UpdateCandidateStatusDto,
} from './dto/candidate.dto.js';

@ApiTags('Candidates')
@ApiBearerAuth()
@ApiSecurity('api-key')
@Controller()
export class CandidatesController {
  constructor(private readonly candidates: CandidatesService) {}

  @Get('jobs/:jobId/candidates')
  @ApiOperation({
    summary: 'Ranked, filterable candidate list',
    description:
      'Sorted by match score (highest first) by default. Candidates below the ' +
      "job's minimum score are listed after the others, not removed.",
  })
  @ApiOkResponse({ type: CandidatePageDto })
  async list(
    @CurrentPrincipal() principal: Principal,
    @Param('jobId', ParseUUIDPipe) jobId: string,
    @Query() query: ListCandidatesQueryDto,
  ): Promise<CandidatePageDto> {
    const { job, items, total } = await this.candidates.list(
      principal.companyId,
      jobId,
      query,
      query,
    );
    return {
      items: items.map(toSummary),
      total,
      page: query.page,
      pageSize: query.pageSize,
      minMatchScore: job.minMatchScore,
    };
  }

  @Get('jobs/:jobId/candidates/export.csv')
  @ApiProduces('text/csv')
  @ApiOperation({ summary: 'Export the filtered candidate list as CSV' })
  exportCsv(
    @CurrentPrincipal() _principal: Principal,
    @Param('jobId', ParseUUIDPipe) _jobId: string,
    @Query() _query: CandidateFiltersDto,
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
      'Candidate card: contacts, score, found and missing skills, each requirement and its contribution, warnings',
  })
  @ApiOkResponse({ type: CandidateDetailDto })
  get(
    @CurrentPrincipal() principal: Principal,
    @Param('candidateId', ParseUUIDPipe) candidateId: string,
  ): Promise<CandidateDetailDto> {
    return this.candidates.getDetail(principal.companyId, candidateId);
  }

  @Patch('candidates/:candidateId/status')
  @ApiOperation({ summary: 'Set the decision: Approved, Rejected or Pending' })
  @ApiOkResponse({ type: CandidateDetailDto })
  updateStatus(
    @CurrentPrincipal() principal: Principal,
    @Param('candidateId', ParseUUIDPipe) candidateId: string,
    @Body() dto: UpdateCandidateStatusDto,
  ): Promise<CandidateDetailDto> {
    return this.candidates.setDecision(
      principal.companyId,
      candidateId,
      dto.status,
    );
  }

  @Get('candidates/:candidateId/resume-file')
  @ApiOperation({ summary: 'Short-lived link to the original resume file' })
  @ApiOkResponse({ type: DownloadLinkDto })
  resumeFile(
    @CurrentPrincipal() principal: Principal,
    @Param('candidateId', ParseUUIDPipe) candidateId: string,
  ): Promise<DownloadLinkDto> {
    return this.candidates.getResumeLink(principal.companyId, candidateId);
  }

  @Delete('candidates/:candidateId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary:
      'Permanently delete a candidate with their resume file and evaluations',
  })
  @ApiNoContentResponse()
  remove(
    @CurrentPrincipal() principal: Principal,
    @Param('candidateId', ParseUUIDPipe) candidateId: string,
  ): Promise<void> {
    return this.candidates.remove(principal.companyId, candidateId);
  }
}
