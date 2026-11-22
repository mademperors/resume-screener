import { Module } from '@nestjs/common';
import { SessionsModule } from '../auth/sessions.module.js';
import { CandidatesDataModule } from '../candidates/candidates-data.module.js';
import { JobsDataModule } from '../jobs/jobs-data.module.js';
import { ResumesDataModule } from '../resumes/resumes-data.module.js';
import { EvaluationRecorder } from './evaluation-recorder.js';
import {
  screeningConfig,
  type ScreeningConfig,
} from '../config/screening.config.js';
import { ResumeRemovalModule } from '../resumes/resume-removal.module.js';
import { DocumentTextExtractor } from './extraction/document-text-extractor.js';
import { RuleBasedResumePreprocessor } from './preprocessing/resume-preprocessor.js';
import { ResumeProcessor } from './resume-processor.service.js';
import { ResumeSweeper } from './resume-sweeper.service.js';
import { ResumeWorker } from './resume-worker.service.js';
import { RetentionService } from './retention.service.js';
import { WeightedScoringEngine } from './scoring/weighted-scoring-engine.js';
import { GeminiScreeningModel } from './screening/gemini-screening-model.js';
import { MockScreeningModel } from './screening/mock-screening-model.js';
import {
  ResumePreprocessor,
  ScoringEngine,
  ScreeningModel,
  TextExtractor,
} from './stages.js';

/**
 * Background resume processing. Needs the database, FileStorage and
 * QueueModule. Each pipeline stage is bound here; swap one by changing its
 * provider. The screening model is chosen with SCREENING_MODEL.
 */
@Module({
  imports: [
    JobsDataModule,
    ResumesDataModule,
    CandidatesDataModule,
    SessionsModule,
    ResumeRemovalModule,
  ],
  providers: [
    EvaluationRecorder,
    ResumeProcessor,
    ResumeSweeper,
    ResumeWorker,
    RetentionService,
    { provide: TextExtractor, useClass: DocumentTextExtractor },
    { provide: ResumePreprocessor, useClass: RuleBasedResumePreprocessor },
    { provide: ScoringEngine, useClass: WeightedScoringEngine },
    {
      provide: ScreeningModel,
      inject: [screeningConfig.KEY],
      useFactory: (config: ScreeningConfig) =>
        config.model === 'gemini'
          ? new GeminiScreeningModel(config.gemini)
          : new MockScreeningModel(),
    },
  ],
  exports: [ResumeWorker, ResumeProcessor, ResumeSweeper, RetentionService],
})
export class ProcessingModule {}
