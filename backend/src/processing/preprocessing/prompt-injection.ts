/**
 * Phrases addressed to an AI rather than to a recruiter. A sentence matching
 * any of them is removed before evaluation and the resume is flagged.
 * English, Ukrainian and Russian. Kept narrow on purpose: ordinary resume
 * wording ("changes must be approved", "system messages") must not match.
 */
const PATTERNS: RegExp[] = [
  /\b(ignore|disregard|forget|override)\b[^.\n]{0,40}\b(previous|prior|above|earlier|all|any|the|your)\b[^.\n]{0,20}\b(instructions?|prompts?|rules|guidelines|requirements|criteria)\b/i,
  /\b(system|developer)\s+(prompt|instructions)\b/i,
  /\byou\s+are\s+(now\s+)?(an?\s+|the\s+)?(ai|assistant|language model|llm|chatbot|gpt|screening (bot|tool|system)|recruit(er|ing) (bot|assistant))\b/i,
  /\bas\s+an?\s+(ai|language model|llm)\b/i,
  /\b(note|message|instruction)s?\s+(to|for)\s+(the\s+)?(ai|llm|gpt|chatgpt|model|bot|screen(er|ing)|ats)\b/i,
  /\b(rate|score|rank|evaluate|mark|grade)\s+(this|the|me|my)\s+(candidate|resume|cv|application|profile)?\s*(as|with|at|a|an)?\s*(perfect|excellent|top|highest|maximum|max|10\/10|100)/i,
  /\b(give|assign|output|return)\s+(this|the|me)?\s*(candidate|resume|cv)?\s*(a\s+)?(score|rating|match)\s+(of\s+)?(100|10\/10|maximum|max|perfect)/i,
  /\b(this|the)\s+candidate\s+(is|meets)\s+(a|an|the)?\s*(perfect|ideal|exceptional)\s+(match|fit)\b/i,
  /\b(candidate|applicant|i|he|she)\s+(must|should)\s+be\s+(hired|shortlisted)\b/i,
  /<\|?(im_start|im_end|system|endoftext)\|?>|\[\/?(INST|SYS)\]|^\s*(system|assistant)\s*:/im,
  // \b doesn't work next to Cyrillic letters, hence the look-arounds.
  /(?<!\p{L})(ігноруй|ігноруйте|проігноруй|забудь)(?!\p{L})[^.\n]{0,40}(інструкці|вказівк|правил)/iu,
  /(?<!\p{L})(игнорируй|игнорируйте|проигнорируй|забудь)(?!\p{L})[^.\n]{0,40}(инструкци|указани|правил)/iu,
  /(?<!\p{L})(ти|ви)\s+(—|-|є)?\s*(штучний інтелект|мовна модель|асистент|бот)(?!\p{L})/iu,
  /(?<!\p{L})(ты|вы)\s+(—|-)?\s*(искусственный интеллект|языковая модель|ассистент|бот)(?!\p{L})/iu,
];

export interface InjectionScan {
  /** The text without the matching sentences. */
  text: string;
  /** The removed sentences, shortened, for logs and notes. */
  removed: string[];
}

/** Splits into sentences and lines and drops those addressed to an AI. */
export function removePromptInjection(text: string): InjectionScan {
  const removed: string[] = [];
  const lines = text.split('\n').map((line) => {
    const sentences = line.match(/[^.!?]+[.!?]*\s*/g) ?? [line];
    return sentences
      .filter((sentence) => {
        if (PATTERNS.some((pattern) => pattern.test(sentence))) {
          removed.push(sentence.trim().slice(0, 120));
          return false;
        }
        return true;
      })
      .join('')
      .trimEnd();
  });
  return { text: lines.join('\n'), removed };
}

/** True if the text contains an instruction addressed to an AI. */
export function containsPromptInjection(text: string): boolean {
  return PATTERNS.some((pattern) => pattern.test(text));
}
