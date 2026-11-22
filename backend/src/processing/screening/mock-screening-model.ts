import { Injectable } from '@nestjs/common';
import type { RequirementVerdict } from '../../candidates/evaluation.types.js';
import type { RequirementSpec } from '../../jobs/requirements.js';
import { containsTerm, spellingsOf } from '../skills.js';
import {
  ScreeningModel,
  type ScreeningInput,
  type ScreeningResult,
} from '../stages.js';
import { estimateExperience } from './experience.js';
import { experienceVerdict, listSkills } from './text-signals.js';

/** Confidence of each kind of finding. */
const CONFIDENCE = {
  skillExact: 0.95,
  skillAlias: 0.8,
  skillAbsent: 0.85,
} as const;

/**
 * Deterministic stand-in for the real model (SCREENING_MODEL=mock): finds skills by name
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
