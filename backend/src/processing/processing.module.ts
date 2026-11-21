import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { EnvironmentVariables } from '../config/env.validation.js';
import { DocumentTextExtractor } from './extraction/document-text-extractor.js';
import { RuleBasedResumePreprocessor } from './preprocessing/resume-preprocessor.js';
import { ResumeRemovalModule } from '../resumes/resume-removal.module.js';
import { ResumeProcessor } from './resume-processor.service.js';
import { ResumeSweeper } from './resume-sweeper.service.js';
import { ResumeWorker } from './resume-worker.service.js';
import { RetentionService } from './retention.service.js';
import { WeightedScoringEngine } from './scoring/weighted-scoring-engine.js';
import { JevScreeningModel } from './screening/jev-screening-model.js';
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
  imports: [ResumeRemovalModule],
  providers: [
    ResumeProcessor,
    ResumeSweeper,
    ResumeWorker,
    RetentionService,
    { provide: TextExtractor, useClass: DocumentTextExtractor },
    { provide: ResumePreprocessor, useClass: RuleBasedResumePreprocessor },
    { provide: ScoringEngine, useClass: WeightedScoringEngine },
    {
      provide: ScreeningModel,
      inject: [ConfigService],
      useFactory: (config: ConfigService<EnvironmentVariables, true>) =>
        config.get('SCREENING_MODEL', { infer: true }) === 'jev'
          ? new JevScreeningModel()
          : new MockScreeningModel(),
    },
  ],
  exports: [ResumeWorker, ResumeProcessor, ResumeSweeper, RetentionService],
})
export class ProcessingModule {}
