import { Injectable } from '@nestjs/common';
import type { RequirementVerdict } from '../../candidates/evaluation.types.js';
import {
  normalizeSkill,
  type RequirementSpec,
} from '../../jobs/requirements.js';
import { containsTerm, KNOWN_SKILLS, spellingsOf } from '../skills.js';
import {
  ScreeningModel,
  type ScreeningInput,
  type ScreeningResult,
} from '../stages.js';
import { estimateExperience, type ExperienceEstimate } from './experience.js';

/** Confidence of each kind of finding. */
const CONFIDENCE = {
  skillExact: 0.95,
  skillAlias: 0.8,
  skillAbsent: 0.85,
  experienceStated: 0.9,
  experienceFromDates: 0.75,
  /** No experience found at all: too unsure, a person should look. */
  experienceUnknown: 0.3,
} as const;

/**
 * Deterministic stand-in for Jev (SCREENING_MODEL=mock): finds skills by name
 * or alias and reads experience from the text. Good enough for development
 * and demos; it doesn't understand context like a real model.
 */
@Injectable()
export class MockScreeningModel extends ScreeningModel {
  static readonly modelName = 'mock-keyword-matcher';
  static readonly modelVersion = '1.0.0';

  constructor(private readonly now: () => Date = () => new Date()) {
    super();
  }

  async evaluate(input: ScreeningInput): Promise<ScreeningResult> {
    const text = input.resumeText;
    const experience = estimateExperience(text, this.now());
    const verdicts = input.requirements.map((requirement) =>
      requirement.kind === 'experience'
        ? experienceVerdict(requirement, experience)
        : skillVerdict(requirement, text),
    );
    return {
      modelName: MockScreeningModel.modelName,
      modelVersion: MockScreeningModel.modelVersion,
      verdicts,
      skills: listSkills(text, input.requirements),
      experienceYears: experience?.years ?? null,
    };
  }
}

function skillVerdict(
  requirement: RequirementSpec,
  text: string,
): RequirementVerdict {
  const { exact, aliases } = spellingsOf(requirement.label);
  if (containsTerm(text, exact)) {
    return {
      requirementId: requirement.id,
      met: true,
      confidence: CONFIDENCE.skillExact,
      evidence: `Mentions ${exact}`,
    };
  }
  const alias = aliases.find((spelling) => containsTerm(text, spelling));
  if (alias) {
    return {
      requirementId: requirement.id,
      met: true,
      confidence: CONFIDENCE.skillAlias,
      evidence: `Mentions ${alias}`,
    };
  }
  return {
    requirementId: requirement.id,
    met: false,
    confidence: CONFIDENCE.skillAbsent,
    evidence: null,
  };
}

function experienceVerdict(
  requirement: RequirementSpec,
  experience: ExperienceEstimate | null,
): RequirementVerdict {
  if (!experience) {
    return {
      requirementId: requirement.id,
      met: false,
      confidence: CONFIDENCE.experienceUnknown,
      evidence: 'No experience found in the resume',
    };
  }
  return {
    requirementId: requirement.id,
    met: experience.years >= (requirement.minYears ?? 0),
    confidence:
      experience.source === 'stated'
        ? CONFIDENCE.experienceStated
        : CONFIDENCE.experienceFromDates,
    evidence:
      experience.source === 'stated'
        ? `States ${experience.years} years of experience`
        : `About ${experience.years} years from job dates`,
  };
}

/** Known technologies and the job's own skills found in the text. */
function listSkills(
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
