import { Logger } from '@nestjs/common';
import type { RequirementVerdict } from '../../candidates/evaluation.types.js';
import type { RequirementSpec } from '../../jobs/requirements.js';
import {
  ScreeningModel,
  type ScreeningInput,
  type ScreeningResult,
} from '../stages.js';
import { estimateExperience } from './experience.js';
import type { GeminiDecisionsClient } from './gemini-decisions-client.js';
import {
  readSkillAnswers,
  skillQuestions,
  type SkillAnswer,
} from './gemini-skill-questions.js';
import { experienceVerdict, listSkills, skillMention } from './text-signals.js';

/**
 * The longest resume text we send. The model reads up to 262,144 tokens in
 * total, and Cyrillic costs about one token per two characters, so this stays
 * far below the limit. Preprocessing already caps the text lower; this guards
 * the API limit whatever the input. Anything beyond is cut (the head of a
 * resume has the skills and the latest jobs).
 */
export const MAX_RESUME_CHARS = 150_000;

/** Evidence for a skill the model confirmed although the text never names it. */
export const INFERRED_EVIDENCE =
  'Not named directly; the model judged it from the resume as a whole';

/**
 * Gemini Decisions API (`gemini-decision-1`), used when SCREENING_MODEL=gemini.
 *
 * One request carries the whole resume and one `choice` question per skill
 * requirement (see gemini-skill-questions.ts); the transport and its errors
 * are in GeminiDecisionsClient. The match score is computed by the scoring
 * module, not by the model.
 *
 * Experience is read from the resume by `estimateExperience` instead of
 * asking the model: adding up job dates is arithmetic, and doing it in code
 * keeps the result repeatable (NFR 6.1). The skills list shown to recruiters
 * and the evidence quotes also come from the text, because the model only
 * answers the questions it is asked.
 */
export class GeminiScreeningModel extends ScreeningModel {
  static readonly modelName = 'gemini';

  private readonly logger = new Logger(GeminiScreeningModel.name);

  constructor(
    private readonly client: GeminiDecisionsClient,
    private readonly now: () => Date = () => new Date(),
  ) {
    super();
  }

  async evaluate(input: ScreeningInput): Promise<ScreeningResult> {
    const text = input.resumeText;
    const experience = estimateExperience(text, this.now());
    const skillRequirements = input.requirements.filter(
      (requirement) => requirement.kind === 'skill',
    );

    let modelVersion = this.client.model;
    const answers = new Map<string, SkillAnswer>();
    if (skillRequirements.length > 0) {
      const response = await this.client.decide({
        input: `Resume:\n${this.limit(text)}`,
        questions: skillQuestions(skillRequirements),
      });
      modelVersion = response.model;
      for (const answer of readSkillAnswers(
        response.answers,
        skillRequirements,
      )) {
        answers.set(answer.requirementId, answer);
      }
    }

    const verdicts = input.requirements.map((requirement) =>
      requirement.kind === 'experience'
        ? experienceVerdict(requirement, experience)
        : skillVerdict(requirement, answers.get(requirement.id)!, text),
    );
    const confirmed = skillRequirements
      .filter((requirement) => answers.get(requirement.id)?.met)
      .map((requirement) => requirement.label);
    return {
      modelName: GeminiScreeningModel.modelName,
      modelVersion,
      verdicts,
      skills: [
        ...new Set([...confirmed, ...listSkills(text, input.requirements)]),
      ],
      experienceYears: experience?.years ?? null,
    };
  }

  private limit(text: string): string {
    if (text.length <= MAX_RESUME_CHARS) {
      return text;
    }
    this.logger.warn(
      `Resume text is ${text.length} characters; sending the first ${MAX_RESUME_CHARS}`,
    );
    return text.slice(0, MAX_RESUME_CHARS);
  }
}

/**
 * The model's answer, with a quote of where the resume names the skill: it
 * shows the recruiter what a "met" rests on, and the context of a "not met"
 * ("only wants to learn Docker").
 */
function skillVerdict(
  requirement: RequirementSpec,
  answer: SkillAnswer,
  text: string,
): RequirementVerdict {
  const mention = skillMention(text, requirement.label);
  return {
    requirementId: requirement.id,
    met: answer.met,
    confidence: answer.confidence,
    evidence: mention ?? (answer.met ? INFERRED_EVIDENCE : null),
  };
}
