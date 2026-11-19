import { buildRequirements } from '../jobs/requirements.js';
import { PermanentProcessingError } from './processing-errors.js';
import { assertValidScreeningResult } from './screening-result.js';
import type { ScreeningResult } from './stages.js';

const requirements = buildRequirements({
  requiredSkills: ['TypeScript'],
  preferredSkills: ['Docker'],
  minExperienceYears: 2,
});

function result(overrides: Partial<ScreeningResult> = {}): ScreeningResult {
  return {
    modelName: 'jev',
    modelVersion: '1',
    skills: ['TypeScript'],
    experienceYears: 3,
    verdicts: requirements.map((r) => ({
      requirementId: r.id,
      met: true,
      confidence: 0.9,
    })),
    ...overrides,
  };
}

function problemsOf(value: ScreeningResult): string {
  try {
    assertValidScreeningResult(value, requirements);
    return '';
  } catch (error) {
    expect(error).toBeInstanceOf(PermanentProcessingError);
    return (error as Error).message;
  }
}

describe('assertValidScreeningResult', () => {
  it('accepts one valid verdict per requirement', () => {
    expect(problemsOf(result())).toBe('');
  });

  it('reports missing, unknown and duplicate verdicts', () => {
    const [first, second] = result().verdicts;
    const message = problemsOf(
      result({
        verdicts: [
          first,
          first,
          second,
          { requirementId: 'skill:cobol', met: true, confidence: 1 },
        ],
      }),
    );
    expect(message).toContain('duplicate verdict for "skill:typescript"');
    expect(message).toContain('unknown requirement "skill:cobol"');
    expect(message).toContain('missing verdict for "experience"');
  });

  it('reports confidences outside 0..1 and impossible experience', () => {
    const verdicts = result().verdicts.map((v, i) =>
      i === 0 ? { ...v, confidence: 1.5 } : v,
    );
    const message = problemsOf(result({ verdicts, experienceYears: -1 }));
    expect(message).toContain('confidence out of range');
    expect(message).toContain('experience years out of range');
  });

  it('requires the model name and version', () => {
    expect(problemsOf(result({ modelVersion: '' }))).toContain(
      'model name or version missing',
    );
  });

  it('shows recruiters a short message, not the details', () => {
    try {
      assertValidScreeningResult(result({ verdicts: [] }), requirements);
    } catch (error) {
      expect((error as PermanentProcessingError).userMessage).toBe(
        'The screening service returned an incomplete result for this resume.',
      );
    }
  });
});
