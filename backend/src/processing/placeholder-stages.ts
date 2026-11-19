import { Injectable } from '@nestjs/common';
import { StageNotImplementedError } from './processing-errors.js';
import {
  ResumePreprocessor,
  ScoringEngine,
  TextExtractor,
  type ExtractedDocument,
  type PreparedResume,
  type ScoreResult,
} from './stages.js';

/*
 * Placeholders until the real stages are built (phase 6). Each one fails the
 * resume with a clear "not set up yet" message instead of guessing a result.
 * Replace the provider in ProcessingModule when an implementation is ready.
 */

@Injectable()
export class PlaceholderTextExtractor extends TextExtractor {
  extract(): Promise<ExtractedDocument> {
    // TODO(phase 6): PDF via pdfjs-dist (keeps font size/colour for hidden
    // text), DOCX via mammoth; throw UnreadableFileError when no text.
    throw new StageNotImplementedError('text extraction');
  }
}

@Injectable()
export class PlaceholderResumePreprocessor extends ResumePreprocessor {
  prepare(): Promise<PreparedResume> {
    // TODO(phase 6): pull out and remove contacts and personal data, drop
    // hidden text and instructions aimed at AI, flag possible manipulation.
    throw new StageNotImplementedError('resume preprocessing');
  }
}

@Injectable()
export class PlaceholderScoringEngine extends ScoringEngine {
  score(): ScoreResult {
    // TODO(phase 6): weighted formula over the verdicts, per-requirement
    // contributions, "Does not meet requirements" / "Needs manual review".
    throw new StageNotImplementedError('scoring');
  }
}
