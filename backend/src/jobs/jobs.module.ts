import { Module } from '@nestjs/common';
import { CandidatesDataModule } from '../candidates/candidates-data.module.js';
import { ResumesDataModule } from '../resumes/resumes-data.module.js';
import { JobsDataModule } from './jobs-data.module.js';
import { JobsController } from './jobs.controller.js';
import { JobsService } from './jobs.service.js';

@Module({
  imports: [JobsDataModule, ResumesDataModule, CandidatesDataModule],
  controllers: [JobsController],
  providers: [JobsService],
  exports: [JobsService],
})
export class JobsModule {}
