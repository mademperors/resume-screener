import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { JobsModule } from '../jobs/jobs.module.js';
import { ScoringConfigVersion } from '../jobs/scoring-config-version.entity.js';
import { Resume } from '../resumes/resume.entity.js';
import { ResumesModule } from '../resumes/resumes.module.js';
import { Candidate } from './candidate.entity.js';
import { CandidatesController } from './candidates.controller.js';
import { CandidatesService } from './candidates.service.js';
import { Evaluation } from './evaluation.entity.js';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Candidate,
      Evaluation,
      ScoringConfigVersion,
      Resume,
    ]),
    JobsModule,
    ResumesModule,
  ],
  controllers: [CandidatesController],
  providers: [CandidatesService],
  exports: [CandidatesService],
})
export class CandidatesModule {}
