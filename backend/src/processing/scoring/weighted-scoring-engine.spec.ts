import { CandidateFlag } from '../../candidates/evaluation.types.js';
import { buildRequirements } from '../../jobs/requirements.js';
import type { PreparedResume, ScreeningResult } from '../stages.js';
import { WeightedScoringEngine } from './weighted-scoring-engine.js';

const config = {
  // weights: TypeScript 2, SQL 2, Docker 1, experience 2 -> total 7
  requirements: buildRequirements({
    requiredSkills: ['TypeScript', 'SQL'],
    preferredSkills: ['Docker'],
    minExperienceYears: 2,
  }),
  manualReviewConfidenceThreshold: 0.6,
};

const resume: PreparedResume = {
  text: '',
  contacts: { fullName: null, email: null, phone: null, location: null },
  manipulationDetected: false,
  manipulationNotes: [],
};

function screening(
  verdicts: Record<string, [boolean, number]>,
): ScreeningResult {
  return {
    modelName: 'm',
    modelVersion: '1',
    skills: ['TypeScript'],
    experienceYears: 3,
    verdicts: Object.entries(verdicts).map(
      ([requirementId, [met, confidence]]) => ({
        requirementId,
        met,
        confidence,
      }),
    ),
  };
}

describe('WeightedScoringEngine', () => {
  const engine = new WeightedScoringEngine();

  it('scores 100 when everything is met with full confidence', () => {
    const result = engine.score(
      config,
      screening({
        'skill:typescript': [true, 1],
        'skill:sql': [true, 1],
        'skill:docker': [true, 1],
        experience: [true, 1],
      }),
      resume,
    );
    expect(result.matchScore).toBe(100);
    expect(result.flags).toEqual([]);
  });

  it('weights each requirement and records its contribution', () => {
    const result = engine.score(
      config,
      screening({
        'skill:typescript': [true, 0.9],
        'skill:sql': [false, 0.9],
        'skill:docker': [true, 1],
        experience: [true, 0.8],
      }),
      resume,
    );
    // 100 * (2*0.9 + 0 + 1*1 + 2*0.8) / 7 = 62.86
    expect(result.matchScore).toBe(62.86);
    expect(
      result.contributions.map((c) => [c.requirementId, c.points, c.maxPoints]),
    ).toEqual([
      ['skill:typescript', 25.71, 28.57],
      ['skill:sql', 0, 28.57],
      ['skill:docker', 14.29, 14.29],
      ['experience', 22.86, 28.57],
    ]);
    expect(result.missingSkills).toEqual(['SQL']);
    expect(result.flags).toEqual([CandidateFlag.DoesNotMeetRequirements]);
  });

  it('asks for manual review when unsure about a mandatory requirement', () => {
    const result = engine.score(
      config,
      screening({
        'skill:typescript': [true, 0.9],
        'skill:sql': [true, 0.9],
        'skill:docker': [false, 0.2],
        experience: [false, 0.3],
      }),
      resume,
    );
    // Unsure, so not "does not meet"; a low confidence on an optional
    // requirement (Docker) doesn't need review.
    expect(result.flags).toEqual([CandidateFlag.NeedsManualReview]);
  });

  it('flags possible manipulation', () => {
    const result = engine.score(
      config,
      screening({
        'skill:typescript': [true, 1],
        'skill:sql': [true, 1],
        'skill:docker': [true, 1],
        experience: [true, 1],
      }),
      { ...resume, manipulationDetected: true },
    );
    expect(result.flags).toEqual([CandidateFlag.PossibleManipulation]);
  });
});
