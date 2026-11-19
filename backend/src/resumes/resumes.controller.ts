import {
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  NotImplementedException,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  UploadedFiles,
  UseInterceptors,
} from '@nestjs/common';
import { FilesInterceptor } from '@nestjs/platform-express';
import {
  ApiAcceptedResponse,
  ApiBearerAuth,
  ApiBody,
  ApiConsumes,
  ApiOkResponse,
  ApiOperation,
  ApiSecurity,
  ApiTags,
} from '@nestjs/swagger';
import { CurrentPrincipal } from '../common/decorators.js';
import type { Principal } from '../common/principal.js';
import {
  ListResumesQueryDto,
  ResumeDto,
  ResumePageDto,
  UploadResultDto,
  UploadResumesQueryDto,
} from './dto/resume.dto.js';
import { ResumesService } from './resumes.service.js';
import {
  MAX_FILES_PER_UPLOAD,
  UPLOAD_HARD_LIMIT_BYTES,
  UploadErrorsInterceptor,
} from './upload-errors.interceptor.js';

@ApiTags('Resumes')
@ApiBearerAuth()
@ApiSecurity('api-key')
@Controller()
export class ResumesController {
  constructor(private readonly resumes: ResumesService) {}

  @Post('jobs/:jobId/resumes')
  @HttpCode(HttpStatus.ACCEPTED)
  @UseInterceptors(
    UploadErrorsInterceptor,
    FilesInterceptor('files', MAX_FILES_PER_UPLOAD, {
      limits: {
        fileSize: UPLOAD_HARD_LIMIT_BYTES,
        files: MAX_FILES_PER_UPLOAD,
      },
      // Browsers send UTF-8 file names without declaring the charset.
      defParamCharset: 'utf8',
    }),
  )
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      required: ['files'],
      properties: {
        files: {
          type: 'array',
          items: { type: 'string', format: 'binary' },
          description: `PDF or DOCX, up to 10 MB each, at most ${MAX_FILES_PER_UPLOAD} per request.`,
        },
      },
    },
  })
  @ApiOperation({
    summary: 'Upload resumes; each accepted file is queued for processing',
    description:
      'Every file gets its own result. A rejected or duplicate file does not stop the others.',
  })
  @ApiAcceptedResponse({ type: UploadResultDto })
  upload(
    @CurrentPrincipal() principal: Principal,
    @Param('jobId', ParseUUIDPipe) jobId: string,
    @Query() query: UploadResumesQueryDto,
    @UploadedFiles() files: Express.Multer.File[] | undefined,
  ): Promise<UploadResultDto> {
    return this.resumes.upload(
      principal,
      jobId,
      files ?? [],
      query.onDuplicate,
    );
  }

  @Get('jobs/:jobId/resumes')
  @ApiOperation({
    summary:
      "List the job's resumes with their processing status, newest first",
  })
  @ApiOkResponse({ type: ResumePageDto })
  async list(
    @CurrentPrincipal() principal: Principal,
    @Param('jobId', ParseUUIDPipe) jobId: string,
    @Query() query: ListResumesQueryDto,
  ): Promise<ResumePageDto> {
    const { items, total } = await this.resumes.list(
      principal.companyId,
      jobId,
      query,
    );
    return {
      items: items.map((resume) => ResumeDto.from(resume)),
      total,
      page: query.page,
      pageSize: query.pageSize,
    };
  }

  @Get('jobs/:jobId/progress')
  @ApiOperation({ summary: 'Processing counters: processed, queued, failed' })
  progress(
    @CurrentPrincipal() _principal: Principal,
    @Param('jobId', ParseUUIDPipe) _jobId: string,
  ) {
    throw new NotImplementedException();
  }

  @Post('jobs/:jobId/resumes/retry-failed')
  @HttpCode(HttpStatus.ACCEPTED)
  @ApiOperation({ summary: "Re-queue all of the job's failed resumes" })
  retryFailed(
    @CurrentPrincipal() _principal: Principal,
    @Param('jobId', ParseUUIDPipe) _jobId: string,
  ) {
    throw new NotImplementedException();
  }

  @Post('resumes/:resumeId/retry')
  @HttpCode(HttpStatus.ACCEPTED)
  @ApiOperation({ summary: 'Re-queue one failed resume' })
  retry(
    @CurrentPrincipal() _principal: Principal,
    @Param('resumeId', ParseUUIDPipe) _resumeId: string,
  ) {
    throw new NotImplementedException();
  }
}
