import type { GeminiSettings } from '../../config/screening.config.js';
import {
  PermanentProcessingError,
  ScreeningModelUnavailableError,
  type ProcessingError,
} from '../processing-errors.js';
import { parseRetryAfter } from './retry-after.js';

/** HTTP statuses that mean "try again later": timeout, rate limit. 5xx is added separately. */
const RETRYABLE_STATUSES = new Set([408, 425, 429]);

/** Google answers 400 (not 401) for a key it does not know. */
const INVALID_KEY = /API key not valid|API_KEY_INVALID|API key expired/i;

/** Error bodies are short; this bounds how much of one is read. */
const MAX_ERROR_BODY_CHARS = 10_000;
/** How much of an error body goes to the log. */
const LOGGED_BODY_CHARS = 300;

export interface DecisionRequest {
  /** The text the questions are about. */
  input: string;
  /** Typed questions by key (letters, digits, _ and -). */
  questions: Record<string, unknown>;
}

export interface DecisionResponse {
  /** The model version that answered. */
  model: string;
  /** Answers by question key, unchecked: their shape depends on the question type. */
  answers: Record<string, unknown>;
}

export interface GeminiClientOptions {
  /** For tests. */
  fetch?: typeof fetch;
  now?: () => Date;
}

/**
 * Transport for the Gemini Decisions API (`POST /v1beta/decisions`): sends
 * one request with the key and a timeout, and turns every way it can fail
 * into a processing error. Temporary problems (timeouts, 429, 5xx) become
 * ScreeningModelUnavailableError, carrying the wait Google asked for;
 * anything else is permanent. Knows nothing about resumes.
 */
export class GeminiDecisionsClient {
  private readonly send: typeof fetch;
  private readonly now: () => Date;

  constructor(
    private readonly settings: GeminiSettings,
    options: GeminiClientOptions = {},
  ) {
    this.send = options.fetch ?? fetch;
    this.now = options.now ?? (() => new Date());
  }

  /** The configured model id, e.g. gemini-decision-1. */
  get model(): string {
    return this.settings.model;
  }

  async decide(request: DecisionRequest): Promise<DecisionResponse> {
    const response = await this.post({
      model: this.settings.model,
      input: request.input,
      questions: request.questions,
    });
    if (!response.ok) {
      throw await this.failure(response);
    }
    const body = await readJson(response);
    if (!isRecord(body) || !isRecord(body.answers)) {
      throw unexpectedGeminiAnswer('no answers in the response');
    }
    return {
      model:
        typeof body.model === 'string' && body.model
          ? body.model
          : this.settings.model,
      answers: body.answers,
    };
  }

  private async post(payload: unknown): Promise<Response> {
    try {
      return await this.send(this.settings.apiUrl, {
        method: 'POST',
        headers: {
          'x-goog-api-key': this.settings.apiKey,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(this.settings.timeoutMs),
      });
    } catch (error) {
      // Timeout, DNS or connection failure: temporary.
      throw new ScreeningModelUnavailableError({
        cause: error,
        detail: `Gemini request failed: ${describe(error)}`,
      });
    }
  }

  private async failure(response: Response): Promise<ProcessingError> {
    const body = await readErrorBody(response);
    // The start of the body for the log; never the request, never the key.
    const detail = `Gemini answered ${response.status}: ${body.slice(0, LOGGED_BODY_CHARS)}`;
    if (response.status >= 500 || RETRYABLE_STATUSES.has(response.status)) {
      return new ScreeningModelUnavailableError({
        detail,
        retryAfterMs:
          parseRetryAfter(response.headers.get('retry-after'), this.now()) ??
          googleRetryDelay(body),
      });
    }
    const rejected =
      response.status === 401 ||
      response.status === 403 ||
      INVALID_KEY.test(body);
    return new PermanentProcessingError(
      rejected
        ? 'The screening service rejected our credentials. Ask the administrator to check the Gemini API key and that the service is available in this region.'
        : 'The screening service could not evaluate this resume.',
      { detail },
    );
  }
}

/** The model answered, but not in a form we can use. Retrying won't help. */
export function unexpectedGeminiAnswer(reason: string, cause?: unknown) {
  return new PermanentProcessingError(
    'The screening service returned an unexpected answer for this resume.',
    { cause, detail: `Unexpected Gemini response: ${reason}` },
  );
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

async function readJson(response: Response): Promise<unknown> {
  try {
    return (await response.json()) as unknown;
  } catch (error) {
    // Only a body that arrived complete but isn't JSON is a bad answer; a
    // timeout or a dropped connection while reading it is temporary.
    if (error instanceof SyntaxError) {
      throw unexpectedGeminiAnswer('the response is not JSON', error);
    }
    throw new ScreeningModelUnavailableError({
      cause: error,
      detail: `Gemini response could not be read: ${describe(error)}`,
    });
  }
}

async function readErrorBody(response: Response): Promise<string> {
  try {
    return (await response.text()).slice(0, MAX_ERROR_BODY_CHARS);
  } catch {
    return '(no body)';
  }
}

/**
 * Google APIs usually say how long to wait in the error body rather than a
 * header: `{"error": {"details": [{"@type": "…google.rpc.RetryInfo",
 * "retryDelay": "36s"}]}}`.
 */
function googleRetryDelay(body: string): number | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(body);
  } catch {
    return null;
  }
  const details =
    isRecord(parsed) && isRecord(parsed.error) ? parsed.error.details : null;
  if (!Array.isArray(details)) {
    return null;
  }
  for (const detail of details) {
    if (
      isRecord(detail) &&
      String(detail['@type']).endsWith('google.rpc.RetryInfo') &&
      typeof detail.retryDelay === 'string'
    ) {
      const seconds = /^(\d+(?:\.\d+)?)s$/.exec(detail.retryDelay.trim());
      if (seconds) {
        return Math.round(Number(seconds[1]) * 1000);
      }
    }
  }
  return null;
}

function describe(error: unknown): string {
  return error instanceof Error
    ? `${error.name}: ${error.message}`
    : String(error);
}
