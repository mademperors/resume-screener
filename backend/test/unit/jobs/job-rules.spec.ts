import { RequestValidationException } from '@src/common/http-exception.filter.js';
import {
  cleanJobSkills,
  resolveScoring,
  sameRequirements,
} from '@src/jobs/job-rules.js';
import { buildRequirements, DEFAULT_SCORING } from '@src/jobs/requirements.js';

describe('cleanJobSkills', () => {
  it('removes duplicates in each list', () => {
    expect(cleanJobSkills(['Go', 'go', 'SQL'], ['Docker', 'docker'])).toEqual({
      requiredSkills: ['Go', 'SQL'],
      preferredSkills: ['Docker'],
    });
  });

  it('rejects a skill that is both required and preferred', () => {
    try {
      cleanJobSkills(['TypeScript'], ['typescript']);
      expect.fail('expected a validation error');
    } catch (error) {
      expect(error).toBeInstanceOf(RequestValidationException);
      expect((error as RequestValidationException).fieldErrors).toEqual([
        {
          field: 'preferredSkills',
          messages: [
            'typescript is already a required skill. List it only once.',
          ],
        },
      ]);
    }
  });

  it('rejects required skills that are blank after trimming', () => {
    expect(() => cleanJobSkills(['  '], [])).toThrow(
      RequestValidationException,
    );
  });
});

describe('sameRequirements', () => {
  const base = { preferredSkills: ['Docker'], minExperienceYears: 2 };

  it('ignores order and spelling of the same skills', () => {
    expect(
      sameRequirements(
        buildRequirements({ ...base, requiredSkills: ['Go', 'SQL'] }),
        buildRequirements({ ...base, requiredSkills: ['sql', 'GO'] }),
      ),
    ).toBe(true);
  });

  it('detects added skills, moved skills and changed experience', () => {
    const before = buildRequirements({ ...base, requiredSkills: ['Go'] });
    expect(
      sameRequirements(
        before,
        buildRequirements({ ...base, requiredSkills: ['Go', 'SQL'] }),
      ),
    ).toBe(false);
    expect(
      sameRequirements(
        before,
        buildRequirements({
          requiredSkills: ['Go', 'Docker'],
          preferredSkills: [],
          minExperienceYears: 2,
        }),
      ),
    ).toBe(false);
    expect(
      sameRequirements(
        before,
        buildRequirements({
          ...base,
          requiredSkills: ['Go'],
          minExperienceYears: 3,
        }),
      ),
    ).toBe(false);
  });
});

describe('resolveScoring', () => {
  const job = {
    requiredSkills: ['TypeScript', 'Kotlin'],
    preferredSkills: ['Docker'],
    minExperienceYears: 2,
  };

  it('starts from the defaults', () => {
    expect(resolveScoring(DEFAULT_SCORING, undefined, job)).toEqual({
      requiredSkillWeight: 2,
      preferredSkillWeight: 1,
      experienceWeight: 2,
      skillWeights: [],
      manualReviewThreshold: 0.6,
    });
  });

  it('applies kind weights, per-skill weights and the threshold', () => {
    const scoring = resolveScoring(
      DEFAULT_SCORING,
      {
        experienceWeight: 0,
        skillWeights: [{ skill: 'kotlin', weight: 4 }],
        manualReviewThreshold: 0.8,
      },
      job,
    );
    expect(scoring).toMatchObject({
      experienceWeight: 0,
      skillWeights: [{ skill: 'Kotlin', weight: 4 }],
      manualReviewThreshold: 0.8,
    });
    expect(
      buildRequirements(job, scoring).map((r) => [r.id, r.weight]),
    ).toEqual([
      ['skill:typescript', 2],
      ['skill:kotlin', 4],
      ['skill:docker', 1],
      ['experience', 0],
    ]);
  });

  it('keeps current values not in the input and drops weights of removed skills', () => {
    const current = {
      ...DEFAULT_SCORING,
      preferredSkillWeight: 3,
      skillWeights: [
        { skill: 'Kotlin', weight: 4 },
        { skill: 'Go', weight: 5 },
      ],
    };
    expect(
      resolveScoring(current, { requiredSkillWeight: 1 }, job),
    ).toMatchObject({
      requiredSkillWeight: 1,
      preferredSkillWeight: 3,
      skillWeights: [{ skill: 'Kotlin', weight: 4 }],
    });
  });

  it("rejects weights for skills the job doesn't have", () => {
    try {
      resolveScoring(
        DEFAULT_SCORING,
        { skillWeights: [{ skill: 'COBOL', weight: 3 }] },
        job,
      );
      expect.fail('expected a validation error');
    } catch (error) {
      expect((error as RequestValidationException).fieldErrors).toEqual([
        {
          field: 'scoring.skillWeights',
          messages: ["COBOL is not one of this job's skills."],
        },
      ]);
    }
  });

  it('rejects settings where nothing carries weight', () => {
    expect(() =>
      resolveScoring(
        DEFAULT_SCORING,
        {
          requiredSkillWeight: 0,
          preferredSkillWeight: 0,
          experienceWeight: 0,
        },
        job,
      ),
    ).toThrow(RequestValidationException);
  });
});
