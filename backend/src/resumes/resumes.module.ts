import { Module } from '@nestjs/common';
import { CandidatesDataModule } from '../candidates/candidates-data.module.js';
import { JobsModule } from '../jobs/jobs.module.js';
import { ResumeDispatcher } from './resume-dispatcher.js';
import { ResumeRemovalModule } from './resume-removal.module.js';
import { ResumeUploadService } from './resume-upload.service.js';
import { ResumesDataModule } from './resumes-data.module.js';
import { ResumesController } from './resumes.controller.js';
import { ResumesService } from './resumes.service.js';

@Module({
  imports: [
    ResumesDataModule,
    CandidatesDataModule,
    JobsModule,
    ResumeRemovalModule,
  ],
  controllers: [ResumesController],
  providers: [ResumesService, ResumeUploadService, ResumeDispatcher],
  exports: [ResumesService, ResumeRemovalModule],
})
export class ResumesModule {}
