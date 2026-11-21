import { Module } from '@nestjs/common';
import { CandidatesModule } from '../candidates/candidates.module.js';
import { JobsModule } from '../jobs/jobs.module.js';
import { ResumesModule } from '../resumes/resumes.module.js';
import { ExportController } from './export.controller.js';
import { ExportService } from './export.service.js';

/**
 * CSV export and the printable report. Separate from the candidate list so a
 * failure here doesn't affect other features; it only reads.
 */
@Module({
  imports: [JobsModule, ResumesModule, CandidatesModule],
  controllers: [ExportController],
  providers: [ExportService],
})
export class ExportModule {}
