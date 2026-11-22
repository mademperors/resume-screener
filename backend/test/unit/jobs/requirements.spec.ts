import {
  buildRequirements,
  cleanSkills,
  normalizeSkill,
  REQUIREMENT_WEIGHTS,
} from '@src/jobs/requirements.js';

describe('requirements', () => {
  it('normalizes skill names for comparison', () => {
    expect(normalizeSkill('  Node.js   Backend ')).toBe('node.js backend');
  });

  it('removes blank and case-insensitive duplicate skills', () => {
    expect(cleanSkills(['TypeScript', ' typescript ', '', 'Go', 'GO'])).toEqual(
      ['TypeScript', 'Go'],
    );
  });

  it('builds mandatory required skills, optional preferred skills and experience', () => {
    const requirements = buildRequirements({
      requiredSkills: ['TypeScript'],
      preferredSkills: ['Docker'],
      minExperienceYears: 3,
    });

    expect(requirements).toEqual([
      {
        id: 'skill:typescript',
        kind: 'skill',
        label: 'TypeScript',
        mandatory: true,
        weight: REQUIREMENT_WEIGHTS.requiredSkill,
      },
      {
        id: 'skill:docker',
        kind: 'skill',
        label: 'Docker',
        mandatory: false,
        weight: REQUIREMENT_WEIGHTS.preferredSkill,
      },
      {
        id: 'experience',
        kind: 'experience',
        label: 'At least 3 years of experience',
        mandatory: true,
        weight: REQUIREMENT_WEIGHTS.experience,
        minYears: 3,
      },
    ]);
  });

  it('omits the experience requirement when no experience is required', () => {
    const requirements = buildRequirements({
      requiredSkills: ['SQL'],
      preferredSkills: [],
      minExperienceYears: 0,
    });
    expect(requirements.map((r) => r.id)).toEqual(['skill:sql']);
  });

  it('uses the singular for one year', () => {
    const [experience] = buildRequirements({
      requiredSkills: [],
      preferredSkills: [],
      minExperienceYears: 1,
    });
    expect(experience.label).toBe('At least 1 year of experience');
  });
});
