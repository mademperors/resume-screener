import { Module } from '@nestjs/common';
import { CandidatesDataModule } from '../candidates/candidates-data.module.js';
import { JobsModule } from '../jobs/jobs.module.js';
import { ResumesModule } from '../resumes/resumes.module.js';
import { ExportController } from './export.controller.js';
import { ExportService } from './export.service.js';

/**
 * CSV export and the printable report. Separate from the candidate list so a
 * failure here doesn't affect other features; it only reads.
 */
@Module({
  imports: [JobsModule, ResumesModule, CandidatesDataModule],
  controllers: [ExportController],
  providers: [ExportService],
})
export class ExportModule {}
