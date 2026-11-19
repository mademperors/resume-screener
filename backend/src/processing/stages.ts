import type {
  CandidateFlag,
  RequirementContribution,
  RequirementVerdict,
} from '../candidates/evaluation.types.js';
import type { RequirementSpec } from '../jobs/requirements.js';

/*
 * The resume pipeline: extract text -> prepare it -> screening model -> score.
 * Each stage is an abstract class used as a DI token, so an implementation
 * can be replaced (e.g. a different model) without touching the others.
 * Errors to throw are in processing-errors.ts.
 */

// --- 1. Text extraction (PDF, DOCX) ---

export interface ExtractedDocument {
  /** Visible text in reading order. */
  text: string;
  /**
   * Text a reader wouldn't see (white or tiny font, hidden formatting…),
   * kept out of `text` so it never influences the evaluation. Preprocessing
   * flags its presence as possible manipulation.
   */
  hiddenText: string[];
}

export abstract class TextExtractor {
  /** Throws UnreadableFileError when no text can be read (e.g. a scan). */
  abstract extract(file: Buffer, mimeType: string): Promise<ExtractedDocument>;
}

// --- 2. Preprocessing ---

export interface CandidateContacts {
  fullName: string | null;
  email: string | null;
  phone: string | null;
  location: string | null;
}

export interface PreparedResume {
  /**
   * What the model may see: contacts and personal data removed, hidden text
   * and instructions addressed to AI removed.
   */
  text: string;
  /** Kept for the recruiter only; never sent to the model. */
  contacts: CandidateContacts;
  manipulationDetected: boolean;
  /** Short reasons, for logs and the candidate card. */
  manipulationNotes: string[];
}

export abstract class ResumePreprocessor {
  abstract prepare(document: ExtractedDocument): Promise<PreparedResume>;
}

// --- 3. Screening model (Jev) ---

export interface ScreeningInput {
  resumeText: string;
  requirements: readonly RequirementSpec[];
}

export interface ScreeningResult {
  modelName: string;
  modelVersion: string;
  /** Exactly one verdict per requirement. */
  verdicts: RequirementVerdict[];
  /** Skills found in the resume, as written there. */
  skills: string[];
  /** Years of relevant commercial experience, if the model could tell. */
  experienceYears: number | null;
}

export abstract class ScreeningModel {
  /**
   * Throws ScreeningModelUnavailableError for temporary problems (retried
   * with backoff) and PermanentProcessingError for anything retrying won't fix.
   */
  abstract evaluate(input: ScreeningInput): Promise<ScreeningResult>;
}

// --- 4. Scoring ---

export interface ScoringConfig {
  requirements: readonly RequirementSpec[];
  manualReviewConfidenceThreshold: number;
}

export interface ScoreResult {
  /** 0..100, computed by the system from the verdicts, not by the model. */
  matchScore: number;
  contributions: RequirementContribution[];
  flags: CandidateFlag[];
  foundSkills: string[];
  missingSkills: string[];
}

export abstract class ScoringEngine {
  abstract score(
    config: ScoringConfig,
    screening: ScreeningResult,
    resume: PreparedResume,
  ): ScoreResult;
}
