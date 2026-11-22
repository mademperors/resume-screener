import type { RequirementVerdict } from '../../candidates/evaluation.types.js';
import {
  normalizeSkill,
  type RequirementSpec,
} from '../../jobs/requirements.js';
import {
  containsTerm,
  findTerm,
  KNOWN_SKILLS,
  spellingsOf,
} from '../skills.js';
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

/** Longest quote used as evidence. */
export const MAX_EXCERPT_CHARS = 120;

/**
 * A short quote around the first place the text names a skill (in any of
 * its spellings), or null if it never does. Run on the prepared text, so the
 * quote holds no contacts or personal data.
 */
export function skillMention(text: string, skill: string): string | null {
  const { exact, aliases } = spellingsOf(skill);
  let first: { index: number; length: number } | null = null;
  for (const spelling of [exact, ...aliases]) {
    const found = findTerm(text, spelling);
    if (found && (!first || found.index < first.index)) {
      first = found;
    }
  }
  return first ? quoteAround(text, first.index, first.length) : null;
}

/**
 * The line holding a match, cut to MAX_EXCERPT_CHARS around it at word
 * boundaries, with "…" where something was left out.
 */
function quoteAround(text: string, index: number, length: number): string {
  const lineStart = text.lastIndexOf('\n', index) + 1;
  const lineEnd = text.indexOf('\n', index + length);
  const end = lineEnd === -1 ? text.length : lineEnd;

  // Centre the match, then give room one side doesn't need to the other.
  const half = Math.max(0, Math.floor((MAX_EXCERPT_CHARS - length) / 2));
  let from = Math.max(lineStart, index - half);
  let to = Math.min(end, index + length + half);
  from = Math.max(lineStart, to - Math.max(MAX_EXCERPT_CHARS, length));
  to = Math.min(end, from + Math.max(MAX_EXCERPT_CHARS, length));

  // Don't start or end in the middle of a word.
  if (from > lineStart && !/\s/.test(text[from - 1])) {
    const space = text.indexOf(' ', from);
    if (space !== -1 && space < index) {
      from = space + 1;
    }
  }
  if (to < end && !/\s/.test(text[to])) {
    const space = text.lastIndexOf(' ', to);
    if (space >= index + length) {
      to = space;
    }
  }
  const quote = text.slice(from, to).trim();
  return `${from > lineStart ? '…' : ''}${quote}${to < end ? '…' : ''}`;
}
