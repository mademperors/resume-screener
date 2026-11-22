import { RequestValidationException } from '../common/http-exception.filter.js';
import type { ScoringSettingsInputDto } from './dto/job.dto.js';
import {
  buildRequirements,
  cleanSkills,
  normalizeSkill,
  type JobRequirementsInput,
  type RequirementSpec,
  type ScoringSettings,
} from './requirements.js';

/**
 * Pure rules for a job's requirements and scoring settings, shared by
 * creating and editing jobs. No I/O, so they are unit tested directly.
 */

/**
 * Removes duplicates and rejects a skill listed as both required and
 * preferred, which would make its weight ambiguous.
 */
export function cleanJobSkills(
  requiredSkills: readonly string[],
  preferredSkills: readonly string[],
): { requiredSkills: string[]; preferredSkills: string[] } {
  const required = cleanSkills(requiredSkills);
  const preferred = cleanSkills(preferredSkills);
  if (required.length === 0) {
    throw new RequestValidationException([
      { field: 'requiredSkills', messages: ['Add at least one value.'] },
    ]);
  }
  const requiredKeys = new Set(required.map(normalizeSkill));
  const overlap = preferred.filter((skill) =>
    requiredKeys.has(normalizeSkill(skill)),
  );
  if (overlap.length > 0) {
    throw new RequestValidationException([
      {
        field: 'preferredSkills',
        messages: overlap.map(
          (skill) => `${skill} is already a required skill. List it only once.`,
        ),
      },
    ]);
  }
  return { requiredSkills: required, preferredSkills: preferred };
}

/**
 * The job's scoring settings after applying the input over the current
 * ones. Per-skill weights must name one of the job's skills; weights for
 * skills no longer in the job are dropped. At least one requirement must
 * carry weight, or every candidate would score 0.
 */
export function resolveScoring(
  current: Readonly<ScoringSettings>,
  input: ScoringSettingsInputDto | undefined,
  job: JobRequirementsInput,
): ScoringSettings {
  const jobSkills = new Map(
    [...job.requiredSkills, ...job.preferredSkills].map((skill) => [
      normalizeSkill(skill),
      skill,
    ]),
  );
  const unknown: string[] = [];
  const skillWeights = new Map<string, { skill: string; weight: number }>();
  for (const entry of input?.skillWeights ?? current.skillWeights) {
    const skill = jobSkills.get(normalizeSkill(entry.skill));
    if (skill) {
      skillWeights.set(normalizeSkill(skill), { skill, weight: entry.weight });
    } else if (input?.skillWeights) {
      unknown.push(entry.skill);
    }
  }
  if (unknown.length > 0) {
    throw new RequestValidationException([
      {
        field: 'scoring.skillWeights',
        messages: unknown.map(
          (skill) => `${skill} is not one of this job's skills.`,
        ),
      },
    ]);
  }

  const scoring: ScoringSettings = {
    requiredSkillWeight:
      input?.requiredSkillWeight ?? current.requiredSkillWeight,
    preferredSkillWeight:
      input?.preferredSkillWeight ?? current.preferredSkillWeight,
    experienceWeight: input?.experienceWeight ?? current.experienceWeight,
    skillWeights: [...skillWeights.values()],
    manualReviewThreshold:
      input?.manualReviewThreshold ?? current.manualReviewThreshold,
  };
  const totalWeight = buildRequirements(job, scoring).reduce(
    (sum, requirement) => sum + requirement.weight,
    0,
  );
  if (totalWeight <= 0) {
    throw new RequestValidationException([
      {
        field: 'scoring',
        messages: ['At least one requirement needs a weight above 0.'],
      },
    ]);
  }
  return scoring;
}

/** Compares what affects scoring; renaming "typescript" to "TypeScript" doesn't. */
export function sameRequirements(
  a: readonly RequirementSpec[],
  b: readonly RequirementSpec[],
): boolean {
  const key = (r: RequirementSpec) =>
    `${r.id}|${r.mandatory}|${r.weight}|${r.minYears ?? ''}`;
  const left = a.map(key).sort();
  const right = b.map(key).sort();
  return (
    left.length === right.length &&
    left.every((value, index) => value === right[index])
  );
}
