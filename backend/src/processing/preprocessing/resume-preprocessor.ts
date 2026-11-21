import { Injectable } from '@nestjs/common';
import { normalizeWhitespace } from '../extraction/text-collector.js';
import {
  ResumePreprocessor,
  type ExtractedDocument,
  type PreparedResume,
} from '../stages.js';
import { isKnownSkillWord } from '../skills.js';
import { EMAIL, findContacts, PHONE, URL } from './contacts.js';
import {
  containsPromptInjection,
  removePromptInjection,
} from './prompt-injection.js';

/** Less hidden text than this is treated as layout noise, not manipulation. */
const MIN_HIDDEN_CHARS = 10;

/**
 * Lines with personal data that must not influence the evaluation (age,
 * gender, nationality…) or that only identify the person (address).
 */
const PERSONAL_DATA_LINE =
  /^\s*(?:date of birth|birth ?date|born|dob|age|gender|sex|nationality|citizenship|marital status|family status|religion|photo|address|location|дата народження|народився|народилася|вік|стать|національність|громадянство|сімейний стан|віросповідання|фото|адреса|місце проживання|дата рождения|возраст|пол|национальность|гражданство|семейное положение|вероисповедание|адрес)\b\s*[:\-–].*$/gimu;

/**
 * Prepares resume text for the screening model: keeps contacts for the
 * recruiter, removes them and other personal data from the text, drops
 * instructions addressed to AI, and flags hidden text.
 */
@Injectable()
export class RuleBasedResumePreprocessor extends ResumePreprocessor {
  async prepare(document: ExtractedDocument): Promise<PreparedResume> {
    const contacts = findContacts(document.text);
    const notes: string[] = [];

    const hiddenChars = document.hiddenText.join('').replace(/\s/g, '').length;
    if (hiddenChars >= MIN_HIDDEN_CHARS) {
      notes.push(
        `Hidden text found (${hiddenChars} characters in white, tiny or invisible formatting); it was not evaluated.`,
      );
    }
    if (
      document.hiddenText.some((segment) => containsPromptInjection(segment))
    ) {
      notes.push('Hidden text contains instructions addressed to AI.');
    }

    const injection = removePromptInjection(document.text);
    if (injection.removed.length > 0) {
      notes.push(
        `Instructions addressed to AI were removed: "${injection.removed[0]}"` +
          (injection.removed.length > 1
            ? ` and ${injection.removed.length - 1} more`
            : ''),
      );
    }

    return {
      text: redactPersonalData(injection.text, contacts.fullName),
      contacts,
      manipulationDetected: notes.length > 0,
      manipulationNotes: notes,
    };
  }
}

/** Removes contacts and personal data so they can't affect the evaluation. */
export function redactPersonalData(
  text: string,
  fullName: string | null,
): string {
  let result = text
    .replace(PERSONAL_DATA_LINE, '')
    .replace(EMAIL, '')
    .replace(URL, '')
    .replace(PHONE, (match) =>
      // Keep year ranges and short numbers ("2019 2023", "5 years").
      match.replace(/\D/g, '').length >= 9 ? '' : match,
    );
  if (fullName) {
    const parts = fullName.split(/\s+/).filter(
      // A name like "Ruby Smith" must not erase the skill "Ruby".
      (part) => part.replace(/\./g, '').length >= 3 && !isKnownSkillWord(part),
    );
    for (const part of [fullName, ...parts]) {
      result = result.replace(
        new RegExp(`(?<!\\p{L})${escapeRegExp(part)}(?!\\p{L})`, 'giu'),
        '',
      );
    }
  }
  return normalizeWhitespace(result);
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
