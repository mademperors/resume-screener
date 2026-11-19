/**
 * One thing a candidate is checked against. A job's requirements are derived
 * from its skills and minimum experience and frozen into a ScoringConfigVersion,
 * so every evaluation can be traced to the exact requirements it used.
 */
export interface RequirementSpec {
  /** Stable across versions, e.g. `skill:typescript` or `experience`. */
  id: string;
  kind: 'skill' | 'experience';
  /** Shown to recruiters, e.g. `TypeScript` or `At least 3 years of experience`. */
  label: string;
  /** Missing a mandatory requirement marks the candidate "Does not meet requirements". */
  mandatory: boolean;
  /** Relative weight in the match score formula. */
  weight: number;
  /** Experience requirements only. */
  minYears?: number;
}

/** Default weights; a later version can make them configurable per job. */
export const REQUIREMENT_WEIGHTS = {
  requiredSkill: 2,
  preferredSkill: 1,
  experience: 2,
} as const;

/**
 * Below this model confidence on a mandatory requirement the candidate is
 * marked "Needs manual review".
 */
export const DEFAULT_MANUAL_REVIEW_CONFIDENCE = 0.6;

export function normalizeSkill(skill: string): string {
  return skill.trim().replace(/\s+/g, ' ').toLowerCase();
}

/** Trims skills and removes case-insensitive duplicates, keeping the first spelling. */
export function cleanSkills(skills: readonly string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const raw of skills) {
    const skill = raw.trim().replace(/\s+/g, ' ');
    const key = normalizeSkill(skill);
    if (skill && !seen.has(key)) {
      seen.add(key);
      result.push(skill);
    }
  }
  return result;
}

export interface JobRequirementsInput {
  requiredSkills: readonly string[];
  preferredSkills: readonly string[];
  minExperienceYears: number;
}

export function buildRequirements(
  job: JobRequirementsInput,
): RequirementSpec[] {
  const skill = (
    name: string,
    mandatory: boolean,
    weight: number,
  ): RequirementSpec => ({
    id: `skill:${normalizeSkill(name)}`,
    kind: 'skill',
    label: name,
    mandatory,
    weight,
  });
  const requirements = [
    ...job.requiredSkills.map((name) =>
      skill(name, true, REQUIREMENT_WEIGHTS.requiredSkill),
    ),
    ...job.preferredSkills.map((name) =>
      skill(name, false, REQUIREMENT_WEIGHTS.preferredSkill),
    ),
  ];
  if (job.minExperienceYears > 0) {
    requirements.push({
      id: 'experience',
      kind: 'experience',
      label: `At least ${job.minExperienceYears} ${
        job.minExperienceYears === 1 ? 'year' : 'years'
      } of experience`,
      mandatory: true,
      weight: REQUIREMENT_WEIGHTS.experience,
      minYears: job.minExperienceYears,
    });
  }
  return requirements;
}
