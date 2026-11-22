import { buildRequirements } from '@src/jobs/requirements.js';
import { containsTerm, spellingsOf } from '@src/processing/skills.js';
import { estimateExperience } from '@src/processing/screening/experience.js';
import { MockScreeningModel } from '@src/processing/screening/mock-screening-model.js';
import {
  MAX_EXCERPT_CHARS,
  skillMention,
} from '@src/processing/screening/text-signals.js';

const NOW = new Date('2026-11-19T00:00:00Z');

describe('skillMention', () => {
  it('quotes the line of the first mention, in any spelling', () => {
    const text = 'Summary\nBuilt services on Postgres 15.\nLater: PostgreSQL.';
    expect(skillMention(text, 'PostgreSQL')).toBe(
      'Built services on Postgres 15.',
    );
  });

  it('cuts a long line around the mention at word boundaries', () => {
    const filler = 'worked on many unrelated things for years';
    const text = `${filler} ${filler} and then Kotlin services ${filler} ${filler} ${filler}`;
    const quote = skillMention(text, 'Kotlin')!;
    expect(quote).toContain('Kotlin services');
    expect(quote.length).toBeLessThanOrEqual(MAX_EXCERPT_CHARS + 2);
    expect(quote).toMatch(/^…\w.*\w…$/);
  });

  it('returns null when the skill is not named', () => {
    expect(skillMention('Java and Spring', 'JavaScript')).toBeNull();
  });
});

describe('containsTerm', () => {
  it('matches whole terms only', () => {
    expect(containsTerm('Java and Spring', 'Java')).toBe(true);
    expect(containsTerm('JavaScript only', 'Java')).toBe(false);
    expect(containsTerm('C++ and C#', 'C')).toBe(false);
    expect(containsTerm('Built in C and C++', 'C')).toBe(true);
    expect(containsTerm('Node.js services', 'Node.js')).toBe(true);
    expect(containsTerm('Node.js services', 'Node')).toBe(false);
  });

  it('needs the same case for short names and acronyms', () => {
    expect(containsTerm("let's go", 'Go')).toBe(false);
    expect(containsTerm('Services in Go', 'Go')).toBe(true);
    expect(containsTerm('the rest of the team', 'REST')).toBe(false);
    expect(containsTerm('postgresql and docker', 'PostgreSQL')).toBe(true);
  });

  it('knows other spellings of common skills', () => {
    expect(spellingsOf('PostgreSQL').aliases).toEqual(
      expect.arrayContaining(['postgres']),
    );
    expect(spellingsOf('Postgres').aliases).toContain('PostgreSQL');
    expect(spellingsOf('Underwater basket weaving').aliases).toEqual([]);
  });
});

describe('estimateExperience', () => {
  it('prefers the stated number of years', () => {
    expect(
      estimateExperience(
        'Engineer with 6+ years of commercial experience. 2024 - present',
        NOW,
      ),
    ).toEqual({ years: 6, source: 'stated' });
    expect(estimateExperience('Досвід: 4 роки', NOW)).toEqual({
      years: 4,
      source: 'stated',
    });
  });

  it('adds up job dates, merging overlaps and skipping education', () => {
    const text = [
      'Experience',
      'Acme, Jan 2018 - Dec 2019',
      'Side project, 2019 - 2020',
      'Globex, 03/2022 - present',
      'Education',
      'University, 2012 - 2017',
    ].join('\n');
    // 2018-01..2020-01 = 24 months; 2022-03..2026-11 = 56 months.
    expect(estimateExperience(text, NOW)).toEqual({
      years: 6.7,
      source: 'date-ranges',
    });
  });

  it('returns null when there is nothing to go on', () => {
    expect(estimateExperience('Motivated and curious.', NOW)).toBeNull();
  });
});

describe('MockScreeningModel', () => {
  const model = new MockScreeningModel(() => NOW);
  const requirements = buildRequirements({
    requiredSkills: ['TypeScript', 'PostgreSQL'],
    preferredSkills: ['Kubernetes'],
    minExperienceYears: 3,
  });

  it('gives a verdict for every requirement', async () => {
    const result = await model.evaluate({
      resumeText:
        'Backend developer, 5 years of experience. TypeScript, Postgres, Docker.',
      requirements,
    });
    expect(result).toMatchObject({
      modelName: 'mock-keyword-matcher',
      modelVersion: '1.0.0',
      experienceYears: 5,
    });
    expect(result.verdicts).toEqual([
      expect.objectContaining({
        requirementId: 'skill:typescript',
        met: true,
        confidence: 0.95,
      }),
      // Found under another spelling, so less sure.
      expect.objectContaining({
        requirementId: 'skill:postgresql',
        met: true,
        confidence: 0.8,
      }),
      expect.objectContaining({
        requirementId: 'skill:kubernetes',
        met: false,
      }),
      expect.objectContaining({
        requirementId: 'experience',
        met: true,
        confidence: 0.9,
      }),
    ]);
    expect(result.skills).toEqual(['TypeScript', 'PostgreSQL', 'Docker']);
  });

  it('is unsure about experience it cannot find', async () => {
    const result = await model.evaluate({
      resumeText: 'TypeScript',
      requirements,
    });
    const experience = result.verdicts.find(
      (v) => v.requirementId === 'experience',
    );
    expect(experience).toMatchObject({ met: false, confidence: 0.3 });
    expect(result.experienceYears).toBeNull();
  });

  it('gives the same result for the same input', async () => {
    const input = { resumeText: 'TypeScript, 2020 - present', requirements };
    expect(await model.evaluate(input)).toEqual(await model.evaluate(input));
  });
});
