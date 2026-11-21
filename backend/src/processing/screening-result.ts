import type { RequirementSpec } from '../jobs/requirements.js';
import { PermanentProcessingError } from './processing-errors.js';
import type { ScreeningResult } from './stages.js';

const INVALID_RESULT =
  'The screening service returned an incomplete result for this resume.';

/**
 * Enforces the model contract before anything is scored or saved: one
 * verdict per requirement, confidences within 0..1, sane experience.
 */
export function assertValidScreeningResult(
  result: ScreeningResult,
  requirements: readonly RequirementSpec[],
): void {
  const problems: string[] = [];
  const expected = new Set(requirements.map((r) => r.id));
  const seen = new Set<string>();

  for (const verdict of result.verdicts) {
    if (!expected.has(verdict.requirementId)) {
      problems.push(`unknown requirement "${verdict.requirementId}"`);
    } else if (seen.has(verdict.requirementId)) {
      problems.push(`duplicate verdict for "${verdict.requirementId}"`);
    }
    seen.add(verdict.requirementId);
    if (
      !Number.isFinite(verdict.confidence) ||
      verdict.confidence < 0 ||
      verdict.confidence > 1
    ) {
      problems.push(`confidence out of range for "${verdict.requirementId}"`);
    }
    if (typeof verdict.met !== 'boolean') {
      problems.push(`no decision for "${verdict.requirementId}"`);
    }
  }
  for (const id of expected) {
    if (!seen.has(id)) {
      problems.push(`missing verdict for "${id}"`);
    }
  }
  if (
    result.experienceYears !== null &&
    (!Number.isFinite(result.experienceYears) ||
      result.experienceYears < 0 ||
      result.experienceYears > 80)
  ) {
    problems.push('experience years out of range');
  }
  if (!result.modelName || !result.modelVersion) {
    problems.push('model name or version missing');
  }

  if (problems.length > 0) {
    throw new PermanentProcessingError(INVALID_RESULT, {
      detail: `Invalid screening result: ${problems.join('; ')}`,
    });
  }
}
