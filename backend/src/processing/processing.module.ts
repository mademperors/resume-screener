import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { processingConfig } from '../config/processing.config.js';
import { queueConfig } from '../config/queue.config.js';
import { retentionConfig } from '../config/retention.config.js';
import { screeningConfig } from '../config/screening.config.js';
import { sessionConfig } from '../config/session.config.js';
import { ResumeRemovalModule } from '../resumes/resume-removal.module.js';
import { textExtractionProviders } from './extraction/text-extraction.providers.js';
import { RuleBasedResumePreprocessor } from './preprocessing/resume-preprocessor.js';
import { ResumeProcessor } from './resume-processor.service.js';
import { ResumeSweeper } from './resume-sweeper.service.js';
import { ResumeWorker } from './resume-worker.service.js';
import { RetentionService } from './retention.service.js';
import { WeightedScoringEngine } from './scoring/weighted-scoring-engine.js';
import { screeningModelProvider } from './screening/screening-model.provider.js';
import { ResumePreprocessor, ScoringEngine } from './stages.js';

/**
 * Background resume processing. Needs the database, FileStorage and
 * QueueModule. Each pipeline stage is bound here; swap one by changing its
 * provider. Text extraction dispatches to a reader per file format; the
 * screening model is chosen with SCREENING_MODEL.
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
    ...textExtractionProviders,
    { provide: ResumePreprocessor, useClass: RuleBasedResumePreprocessor },
    screeningModelProvider,
    { provide: ScoringEngine, useClass: WeightedScoringEngine },
  ],
  exports: [ResumeWorker, ResumeProcessor, ResumeSweeper, RetentionService],
})
export class ProcessingModule {}
