import { StorageUnavailableError } from '../storage/file-storage.js';

/**
 * Base class for expected processing failures. `userMessage` is what the
 * recruiter sees on the resume; `retryable` decides whether it is retried.
 */
export abstract class ProcessingError extends Error {
  abstract readonly retryable: boolean;

  constructor(
    readonly userMessage: string,
    options?: { cause?: unknown; detail?: string },
  ) {
    super(options?.detail ?? userMessage, { cause: options?.cause });
    this.name = new.target.name;
  }
}

/** No text could be read: a scan, an image-only or a damaged file. */
export class UnreadableFileError extends ProcessingError {
  readonly retryable = false;

  constructor(options?: { cause?: unknown; detail?: string }) {
    super(
      'Could not read text from this file. It may be a scan or damaged. Upload a text-based PDF or DOCX.',
      options,
    );
  }
}

/** The screening model is temporarily unavailable or rate limited. */
export class ScreeningModelUnavailableError extends ProcessingError {
  readonly retryable = true;

  constructor(options?: { cause?: unknown; detail?: string }) {
    super(
      'The screening service is temporarily unavailable. Processing will be retried.',
      options,
    );
  }
}

/** A failure that retrying won't fix. */
export class PermanentProcessingError extends ProcessingError {
  readonly retryable = false;
}

/** A pipeline stage that hasn't been built yet. */
export class StageNotImplementedError extends PermanentProcessingError {
  constructor(stage: string) {
    super(
      `Resume processing is not fully set up yet (${stage} is missing). Try again later.`,
    );
  }
}

export interface FailureDescription {
  retryable: boolean;
  /** Shown to recruiters. */
  userMessage: string;
}

const RETRYABLE_UNKNOWN_MESSAGE =
  'Something went wrong while processing this resume. It will be retried.';

/** Unknown errors (database hiccups, bugs) are retried; known ones say how. */
export function describeFailure(error: unknown): FailureDescription {
  if (error instanceof ProcessingError) {
    return { retryable: error.retryable, userMessage: error.userMessage };
  }
  if (error instanceof StorageUnavailableError) {
    return {
      retryable: true,
      userMessage:
        'File storage is temporarily unavailable. Processing will be retried.',
    };
  }
  return { retryable: true, userMessage: RETRYABLE_UNKNOWN_MESSAGE };
}

/** Message once all retries are used up. */
export function exhaustedMessage(failure: FailureDescription): string {
  return failure.userMessage.replace(
    / (Processing|It) will be retried\.$/,
    ' Retry processing later.',
  );
}
