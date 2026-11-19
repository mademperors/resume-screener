import { Module } from '@nestjs/common';
import { ResumeRemovalService } from './resume-removal.service.js';

/** Deleting resumes with their data and files; used by the API and the worker. */
@Module({
  providers: [ResumeRemovalService],
  exports: [ResumeRemovalService],
})
export class ResumeRemovalModule {}
