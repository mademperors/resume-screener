import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { processingConfig } from '../config/processing.config.js';
import { queueConfig } from '../config/queue.config.js';
import { retentionConfig } from '../config/retention.config.js';
import {
  screeningConfig,
  type ScreeningConfig,
} from '../config/screening.config.js';
import { sessionConfig } from '../config/session.config.js';
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
    ConfigModule.forFeature(processingConfig),
    ConfigModule.forFeature(queueConfig),
    ConfigModule.forFeature(retentionConfig),
    ConfigModule.forFeature(screeningConfig),
    ConfigModule.forFeature(sessionConfig),
    ResumeRemovalModule,
  ],
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
