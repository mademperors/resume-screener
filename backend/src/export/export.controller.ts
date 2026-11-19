import {
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Query,
  StreamableFile,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOkResponse,
  ApiOperation,
  ApiProduces,
  ApiSecurity,
  ApiTags,
} from '@nestjs/swagger';
import { Readable } from 'node:stream';
import { CandidateFiltersDto } from '../candidates/dto/candidate.dto.js';
import { ApiStandardErrors } from '../common/api-errors.decorator.js';
import { CurrentPrincipal } from '../common/decorators.js';
import type { Principal } from '../common/principal.js';
import { attachmentDisposition } from './csv.js';
import { JobReportDto } from './dto/report.dto.js';
import { ExportService, MAX_EXPORT_ROWS } from './export.service.js';

@ApiTags('Export')
@ApiBearerAuth()
@ApiSecurity('api-key')
@ApiStandardErrors()
@Controller()
export class ExportController {
  constructor(private readonly exports: ExportService) {}

  @Get('jobs/:jobId/candidates/export.csv')
  @ApiProduces('text/csv')
  @ApiOperation({
    summary: 'Export the filtered candidate list as CSV',
    description: `Same filters and order as the candidate list; up to ${MAX_EXPORT_ROWS} rows. An empty list gives just the header row.`,
  })
  @ApiOkResponse({ description: 'UTF-8 CSV with a byte order mark.' })
  async exportCsv(
    @CurrentPrincipal() principal: Principal,
    @Param('jobId', ParseUUIDPipe) jobId: string,
    @Query() filters: CandidateFiltersDto,
  ): Promise<StreamableFile> {
    const job = await this.exports.getJob(principal.companyId, jobId);
    const date = new Date().toISOString().slice(0, 10);
    return new StreamableFile(Readable.from(this.exports.csv(job, filters)), {
      type: 'text/csv; charset=utf-8',
      disposition: attachmentDisposition(
        `${job.title} - candidates ${date}.csv`,
      ),
    });
  }

  @Get('jobs/:jobId/report')
  @ApiOperation({
    summary: 'Summary report for a job, for printing',
    description:
      'Processing counts, candidate statistics, how many candidates meet each requirement, and the top candidates.',
  })
  @ApiOkResponse({ type: JobReportDto })
  report(
    @CurrentPrincipal() principal: Principal,
    @Param('jobId', ParseUUIDPipe) jobId: string,
  ): Promise<JobReportDto> {
    return this.exports.report(principal.companyId, jobId);
  }
}
