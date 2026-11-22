import { Module } from '@nestjs/common';
import { CandidateReportsRepository } from './candidate-reports.repository.js';
import { CandidatesRepository } from './candidates.repository.js';
import { EvaluationsRepository } from './evaluations.repository.js';

/** Database access for candidates and evaluations; see JobsDataModule. */
@Module({
  providers: [
    CandidatesRepository,
    EvaluationsRepository,
    CandidateReportsRepository,
  ],
  exports: [
    CandidatesRepository,
    EvaluationsRepository,
    CandidateReportsRepository,
  ],
})
export class CandidatesDataModule {}
