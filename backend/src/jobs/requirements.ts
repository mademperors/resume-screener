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

/** A weight for one skill that overrides the weight of its kind. */
export interface SkillWeight {
  skill: string;
  weight: number;
}

/**
 * How a job is scored. Part of the job; frozen with its requirements into
 * each ScoringConfigVersion.
 */
export interface ScoringSettings {
  /** Weight of each required (mandatory) skill. */
  requiredSkillWeight: number;
  /** Weight of each preferred skill. */
  preferredSkillWeight: number;
  /** Weight of the minimum-experience requirement. */
  experienceWeight: number;
  /** Per-skill overrides, e.g. Kotlin counts 4 while other required skills count 2. */
  skillWeights: SkillWeight[];
  /**
   * Below this model confidence (0..1) on a mandatory requirement the
   * candidate is marked "Needs manual review".
   */
  manualReviewThreshold: number;
}

export const DEFAULT_SCORING: Readonly<ScoringSettings> = Object.freeze({
  requiredSkillWeight: 2,
  preferredSkillWeight: 1,
  experienceWeight: 2,
  skillWeights: [],
  manualReviewThreshold: 0.6,
});

/** Default weights by kind. */
export const REQUIREMENT_WEIGHTS = {
  requiredSkill: DEFAULT_SCORING.requiredSkillWeight,
  preferredSkill: DEFAULT_SCORING.preferredSkillWeight,
  experience: DEFAULT_SCORING.experienceWeight,
} as const;

export const DEFAULT_MANUAL_REVIEW_CONFIDENCE =
  DEFAULT_SCORING.manualReviewThreshold;

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
  scoring: Readonly<ScoringSettings> = DEFAULT_SCORING,
): RequirementSpec[] {
  const overrides = new Map(
    scoring.skillWeights.map((w) => [normalizeSkill(w.skill), w.weight]),
  );
  const weightOf = (name: string, byKind: number) =>
    overrides.get(normalizeSkill(name)) ?? byKind;
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
      skill(name, true, weightOf(name, scoring.requiredSkillWeight)),
    ),
    ...job.preferredSkills.map((name) =>
      skill(name, false, weightOf(name, scoring.preferredSkillWeight)),
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
      weight: scoring.experienceWeight,
      minYears: job.minExperienceYears,
    });
  }
  return requirements;
}
