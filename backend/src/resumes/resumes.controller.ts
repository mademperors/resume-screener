import {
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  NotImplementedException,
  Param,
  ParseUUIDPipe,
  Post,
  UploadedFiles,
  UseInterceptors,
} from '@nestjs/common';
import { FilesInterceptor } from '@nestjs/platform-express';
import {
  ApiBearerAuth,
  ApiBody,
  ApiConsumes,
  ApiOperation,
  ApiSecurity,
  ApiTags,
} from '@nestjs/swagger';
import { CurrentPrincipal } from '../common/decorators.js';
import type { Principal } from '../common/principal.js';

export const MAX_RESUME_FILE_BYTES = 10 * 1024 * 1024;

// TODO(3.5): implement with object storage (3.1) and the processing queue (3.7).
@ApiTags('Resumes')
@ApiBearerAuth()
@ApiSecurity('api-key')
@Controller()
export class ResumesController {
  @Post('jobs/:jobId/resumes')
  @HttpCode(HttpStatus.ACCEPTED)
  @UseInterceptors(FilesInterceptor('files'))
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      required: ['files'],
      properties: {
        files: {
          type: 'array',
          items: { type: 'string', format: 'binary' },
          description: 'PDF or DOCX, up to 10 MB each.',
        },
      },
    },
  })
  @ApiOperation({
    summary: 'Upload one or more resumes; each is queued for processing',
  })
  upload(
    @CurrentPrincipal() _principal: Principal,
    @Param('jobId', ParseUUIDPipe) _jobId: string,
    @UploadedFiles() _files: Express.Multer.File[],
  ) {
    throw new NotImplementedException();
  }

  @Get('jobs/:jobId/resumes')
  @ApiOperation({
    summary: "List the job's resumes with their processing status",
  })
  list(
    @CurrentPrincipal() _principal: Principal,
    @Param('jobId', ParseUUIDPipe) _jobId: string,
  ) {
    throw new NotImplementedException();
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
