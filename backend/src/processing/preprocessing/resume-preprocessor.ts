import { Injectable, Logger } from '@nestjs/common';
import {
  ResumePreprocessor,
  type ExtractedDocument,
  type PreparedResume,
} from '../stages.js';
import { findContacts } from './contacts.js';
import { redactPersonalData } from './personal-data.js';
import {
  containsPromptInjection,
  removePromptInjection,
} from './prompt-injection.js';
import { limitForAnalysis, normalizeText } from './text-normalization.js';

/** Less hidden text than this is treated as layout noise, not manipulation. */
const MIN_HIDDEN_CHARS = 10;

/**
 * Prepares resume text for the screening model: normalises it and bounds its
 * size, keeps contacts for the recruiter, removes them and other personal
 * data from the text, drops instructions addressed to AI, and flags hidden
 * text.
 */
@Injectable()
export class RuleBasedResumePreprocessor extends ResumePreprocessor {
  private readonly logger = new Logger(RuleBasedResumePreprocessor.name);

  async prepare(document: ExtractedDocument): Promise<PreparedResume> {
    const normalized = normalizeText(document.text);
    const text = this.limit(normalized.text);
    // Text in invisible characters is hidden text like white text is.
    const hiddenText = [
      ...document.hiddenText.flatMap((segment) => {
        const hidden = normalizeText(segment);
        return [hidden.text, ...hidden.invisible];
      }),
      ...normalized.invisible,
    ];

    const contacts = findContacts(text);
    const notes: string[] = [];

    const hiddenChars = hiddenText.join('').replace(/\s/g, '').length;
    if (hiddenChars >= MIN_HIDDEN_CHARS) {
      notes.push(
        `Hidden text found (${hiddenChars} characters in white, tiny or invisible formatting); it was not evaluated.`,
      );
    }
    if (hiddenText.some((segment) => containsPromptInjection(segment))) {
      notes.push('Hidden text contains instructions addressed to AI.');
    }

    const injection = removePromptInjection(text);
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

  /** Cuts oversized input; logged, since it changes what is evaluated. */
  private limit(text: string): string {
    const limited = limitForAnalysis(text);
    if (limited.cutChars > 0 || limited.cutWords > 0) {
      this.logger.warn(
        `Resume text shortened for analysis: ${limited.cutChars} characters cut from the end, ${limited.cutWords} overlong words cut`,
      );
    }
    return limited.text;
  }
}
