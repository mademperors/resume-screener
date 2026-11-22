import type { RequirementVerdict } from '../../candidates/evaluation.types.js';
import {
  normalizeSkill,
  type RequirementSpec,
} from '../../jobs/requirements.js';
import { containsTerm, KNOWN_SKILLS, spellingsOf } from '../skills.js';
import type { ExperienceEstimate } from './experience.js';

/*
 * Facts read straight from the resume text, without a model. The mock model
 * uses them for everything; the Gemini model uses them for experience (dates are
 * arithmetic, not judgement) and for the list of skills it shows recruiters.
 */

/** Confidence of each kind of experience finding. */
export const EXPERIENCE_CONFIDENCE = {
  stated: 0.9,
  fromDates: 0.75,
  /** No experience found at all: too unsure, a person should look. */
  unknown: 0.3,
} as const;

export function experienceVerdict(
  requirement: RequirementSpec,
  experience: ExperienceEstimate | null,
): RequirementVerdict {
  if (!experience) {
    return {
      requirementId: requirement.id,
      met: false,
      confidence: EXPERIENCE_CONFIDENCE.unknown,
      evidence: 'No experience found in the resume',
    };
  }
  return {
    requirementId: requirement.id,
    met: experience.years >= (requirement.minYears ?? 0),
    confidence:
      experience.source === 'stated'
        ? EXPERIENCE_CONFIDENCE.stated
        : EXPERIENCE_CONFIDENCE.fromDates,
    evidence:
      experience.source === 'stated'
        ? `States ${experience.years} years of experience`
        : `About ${experience.years} years from job dates`,
  };
}

/** Known technologies and the job's own skills found in the text. */
export function listSkills(
  text: string,
  requirements: readonly RequirementSpec[],
): string[] {
  const found = new Map<string, string>();
  const add = (name: string) => {
    const key = normalizeSkill(name);
    if (!found.has(key)) {
      found.set(key, name);
    }
  };
  for (const requirement of requirements) {
    if (requirement.kind !== 'skill') {
      continue;
    }
    const { exact, aliases } = spellingsOf(requirement.label);
    if ([exact, ...aliases].some((spelling) => containsTerm(text, spelling))) {
      add(requirement.label);
    }
  }
  for (const [name, aliases] of Object.entries(KNOWN_SKILLS)) {
    // Many tech names are also English words ("Rust", "Spring", "Express"),
    // so names count only as written; aliases are distinctive enough.
    if (
      containsTerm(text, name, { caseSensitive: true }) ||
      aliases.some((alias) => containsTerm(text, alias))
    ) {
      add(name);
    }
  }
  return [...found.values()];
}
