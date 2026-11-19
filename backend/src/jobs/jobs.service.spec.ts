import { RequestValidationException } from '../common/http-exception.filter.js';
import { cleanJobSkills, sameRequirements } from './jobs.service.js';
import { buildRequirements } from './requirements.js';

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
