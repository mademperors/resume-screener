import { Module } from '@nestjs/common';
import {
  PlaceholderResumePreprocessor,
  PlaceholderScoringEngine,
  PlaceholderTextExtractor,
} from './placeholder-stages.js';
import { ResumeProcessor } from './resume-processor.service.js';
import { ResumeSweeper } from './resume-sweeper.service.js';
import { ResumeWorker } from './resume-worker.service.js';
import { JevScreeningModel } from './screening/jev-screening-model.js';
import {
  ResumePreprocessor,
  ScoringEngine,
  ScreeningModel,
  TextExtractor,
} from './stages.js';

/**
 * Background resume processing. Needs the database, FileStorage and
 * QueueModule. Swap a stage by changing its `useClass` below.
 */
@Module({
  providers: [
    ResumeProcessor,
    ResumeSweeper,
    ResumeWorker,
    { provide: TextExtractor, useClass: PlaceholderTextExtractor },
    { provide: ResumePreprocessor, useClass: PlaceholderResumePreprocessor },
    { provide: ScreeningModel, useClass: JevScreeningModel },
    { provide: ScoringEngine, useClass: PlaceholderScoringEngine },
  ],
  exports: [ResumeWorker, ResumeProcessor, ResumeSweeper],
})
export class ProcessingModule {}
