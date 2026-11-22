import { Module } from '@nestjs/common';
import { JobsDataModule } from '../jobs/jobs-data.module.js';
import { JobsModule } from '../jobs/jobs.module.js';
import { ResumeRemovalModule } from '../resumes/resume-removal.module.js';
import { ResumesDataModule } from '../resumes/resumes-data.module.js';
import { CandidatesDataModule } from './candidates-data.module.js';
import { CandidatesController } from './candidates.controller.js';
import { CandidatesService } from './candidates.service.js';

@Module({
  imports: [
    CandidatesDataModule,
    JobsDataModule,
    ResumesDataModule,
    JobsModule,
    ResumeRemovalModule,
  ],
  controllers: [CandidatesController],
  providers: [CandidatesService],
  exports: [CandidatesService],
})
export class CandidatesModule {}
