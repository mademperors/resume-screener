import { Injectable, Logger } from '@nestjs/common';
import { StageNotImplementedError } from '../processing-errors.js';
import {
  ScreeningModel,
  type ScreeningInput,
  type ScreeningResult,
} from '../stages.js';

/**
 * Jev (TypeSafe AI / MindStudio) integration. Owned by the Jev developer; the
 * rest of the system only depends on the ScreeningModel contract in stages.ts.
 *
 * What the implementation must do:
 * - Send `input.resumeText` (already stripped of contacts and hidden text)
 *   and `input.requirements` to Jev. Read the API URL and key from env
 *   (add e.g. JEV_API_URL and JEV_API_KEY to env.validation.ts); never
 *   hard-code secrets.
 * - Return exactly one verdict per requirement id with `met` and a
 *   `confidence` in 0..1, plus the skills and experience years found.
 *   ResumeProcessor rejects incomplete results.
 * - Set `modelName` / `modelVersion` so every evaluation records which model
 *   produced it.
 * - Throw ScreeningModelUnavailableError on timeouts, 5xx and 429 responses
 *   (retried with backoff), PermanentProcessingError on anything else.
 * - Request rate is already limited by the worker
 *   (SCREENING_RATE_LIMIT_PER_SECOND), no need to limit here.
 */
@Injectable()
export class JevScreeningModel extends ScreeningModel {
  private readonly logger = new Logger(JevScreeningModel.name);

  evaluate(input: ScreeningInput): Promise<ScreeningResult> {
    this.logger.debug(
      `Jev is not connected yet; ${input.requirements.length} requirement(s) not evaluated`,
    );
    throw new StageNotImplementedError('the Jev screening model');
  }
}
