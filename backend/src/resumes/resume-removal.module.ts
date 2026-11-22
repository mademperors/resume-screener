import { Module } from '@nestjs/common';
import { ResumeRemovalService } from './resume-removal.service.js';
import { ResumesDataModule } from './resumes-data.module.js';

/** Deleting resumes with their data and files; used by the API and the worker. */
@Module({
  imports: [ResumesDataModule],
  providers: [ResumeRemovalService],
  exports: [ResumeRemovalService],
})
export class ResumeRemovalModule {}
