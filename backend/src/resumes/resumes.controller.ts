import {
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Delete,
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
  ApiNoContentResponse,
  ApiConsumes,
  ApiOkResponse,
  ApiOperation,
  ApiSecurity,
  ApiTags,
} from '@nestjs/swagger';
import { ApiStandardErrors } from '../common/api-errors.decorator.js';
import { CurrentPrincipal } from '../common/decorators.js';
import type { Principal } from '../common/principal.js';
import {
  ListResumesQueryDto,
  ProgressDto,
  RequeueResultDto,
  ResumeDto,
  ResumePageDto,
  UploadResultDto,
  UploadResumesQueryDto,
} from './dto/resume.dto.js';
import { ResumeUploadService } from './resume-upload.service.js';
import { ResumesService } from './resumes.service.js';
import {
  MAX_FILES_PER_UPLOAD,
  UPLOAD_HARD_LIMIT_BYTES,
  UploadErrorsInterceptor,
} from './upload-errors.interceptor.js';

@ApiTags('Resumes')
@ApiBearerAuth()
@ApiSecurity('api-key')
@ApiStandardErrors()
@Controller()
export class ResumesController {
  constructor(
    private readonly resumes: ResumesService,
    private readonly uploads: ResumeUploadService,
  ) {}

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
    return this.uploads.upload(
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
    const { items, total, candidateIds } = await this.resumes.list(
      principal.companyId,
      jobId,
      query,
    );
    return {
      items: items.map((resume) =>
        ResumeDto.from(resume, candidateIds.get(resume.id) ?? null),
      ),
      total,
      page: query.page,
      pageSize: query.pageSize,
    };
  }

  @Get('jobs/:jobId/progress')
  @ApiOperation({
    summary: 'Processing counters: processed, queued, failed',
    description: 'Poll every few seconds while done is false.',
  })
  @ApiOkResponse({ type: ProgressDto })
  progress(
    @CurrentPrincipal() principal: Principal,
    @Param('jobId', ParseUUIDPipe) jobId: string,
  ): Promise<ProgressDto> {
    return this.resumes.progress(principal.companyId, jobId);
  }

  @Delete('resumes/:resumeId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Permanently delete a resume with its candidate and file',
  })
  @ApiNoContentResponse()
  remove(
    @CurrentPrincipal() principal: Principal,
    @Param('resumeId', ParseUUIDPipe) resumeId: string,
  ): Promise<void> {
    return this.resumes.remove(principal.companyId, resumeId);
  }

  @Post('jobs/:jobId/resumes/retry-failed')
  @HttpCode(HttpStatus.ACCEPTED)
  @ApiOperation({ summary: "Queue all of the job's failed resumes again" })
  @ApiAcceptedResponse({ type: RequeueResultDto })
  async retryFailed(
    @CurrentPrincipal() principal: Principal,
    @Param('jobId', ParseUUIDPipe) jobId: string,
  ): Promise<RequeueResultDto> {
    return {
      queued: await this.resumes.retryFailed(principal.companyId, jobId),
    };
  }

  @Post('jobs/:jobId/rescore')
  @HttpCode(HttpStatus.ACCEPTED)
  @ApiOperation({
    summary: "Score the job's resumes again with its current requirements",
    description:
      'Use after changing requirements (PATCH /jobs/{jobId} returns rescoreSuggested). ' +
      'Recruiter decisions on candidates are kept.',
  })
  @ApiAcceptedResponse({ type: RequeueResultDto })
  async rescore(
    @CurrentPrincipal() principal: Principal,
    @Param('jobId', ParseUUIDPipe) jobId: string,
  ): Promise<RequeueResultDto> {
    return { queued: await this.resumes.rescore(principal.companyId, jobId) };
  }

  @Post('resumes/:resumeId/retry')
  @HttpCode(HttpStatus.ACCEPTED)
  @ApiOperation({ summary: 'Queue one failed resume again' })
  @ApiAcceptedResponse({ type: ResumeDto })
  async retry(
    @CurrentPrincipal() principal: Principal,
    @Param('resumeId', ParseUUIDPipe) resumeId: string,
  ): Promise<ResumeDto> {
    return ResumeDto.from(
      await this.resumes.retry(principal.companyId, resumeId),
    );
  }
}
