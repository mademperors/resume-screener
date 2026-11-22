import { matchingForm } from './text-normalization.js';

/**
 * Phrases addressed to an AI rather than to a recruiter. A sentence matching
 * any of them is removed before evaluation and the resume is flagged.
 * English, Ukrainian and Russian. Kept narrow on purpose: ordinary resume
 * wording ("changes must be approved", "system messages", "acted as team
 * lead") must not match.
 *
 * Matching runs on `matchingForm`, so look-alike letters, invisible
 * characters, styled Unicode and spaced-out letters don't hide a phrase.
 * `\b` doesn't work next to Cyrillic, hence the (?<!\p{L}) look-arounds.
 */
const PATTERNS: RegExp[] = [
  // --- Overriding the instructions ---
  /\b(ignore|disregard|forget|override|bypass|skip)\b[^.\n]{0,40}\b(previous|prior|above|earlier|preceding|all|any|the|your|these|those)\b[^.\n]{0,20}\b(instructions?|prompts?|rules|guidelines|requirements|criteria|directions|context|commands)\b/i,
  /\b(ignore|disregard|forget)\s+(everything|all)\s+(above|before|previously|you were told)\b/i,
  /\b(do\s+not|don'?t|never)\s+(follow|obey|apply)\s+(the|your|any)\s+(previous|prior|original|system)?\s*(instructions?|rules|guidelines|criteria)\b/i,
  /\b(new|updated|real|actual)\s+instructions?\s*:/i,
  /\b(system|developer)\s+(prompt|instructions|message)\s*:/i,
  /\b(system|developer)\s+prompt\b/i,
  /\b(reveal|print|repeat|show|output)\s+(your|the)\s+(system\s+)?(prompt|instructions)\b/i,
  /\b(jailbreak|DAN mode|developer mode enabled)\b/i,

  // --- Talking to the model ---
  /\byou\s+are\s+(now\s+)?(an?\s+|the\s+)?(ai|assistant|language model|llm|chatbot|gpt|screening (bot|tool|system|model)|recruit(er|ing) (bot|assistant|ai))\b/i,
  /\bas\s+an?\s+(ai|language model|llm)\b/i,
  /\b(from now on|henceforth)\b[^.\n]{0,40}\byou\b/i,
  /^\s*(please\s+)?(pretend|imagine)\s+(that\s+)?(you\s+are|you're|to be)\b/im,
  /\b(note|message|instruction)s?\s+(to|for)\s+(the\s+)?(ai|llm|gpt|chatgpt|model|bot|screen(er|ing)|ats|reviewer model)\b/i,
  /\b(dear|hey|hi|attention)\s*,?\s+(ai|llm|gpt|chatgpt|bot|ats|screening (model|system|bot))\b/i,
  /<\|?(im_start|im_end|system|endoftext)\|?>|\[\/?(INST|SYS)\]|^\s*(system|assistant)\s*:/im,

  // --- Asking for a result ---
  /\b(rate|score|rank|evaluate|mark|grade)\s+(this|the|me|my)\s+(candidate|resume|cv|application|profile)?\s*(as|with|at|a|an)?\s*(perfect|excellent|top|highest|maximum|max|10\/10|100)/i,
  /\b(give|assign|output|return)\s+(this|the|me)?\s*(candidate|resume|cv)?\s*(a\s+)?(score|rating|match)\s+(of\s+)?(100|10\/10|maximum|max|perfect)/i,
  /\b(mark|treat|consider|answer)\s+(all|every|each)\s+(requirements?|criteria|skills?|questions?)\s+(as\s+)?(met|satisfied|fulfilled|yes|true)\b/i,
  /\b(answer|respond|reply|choose|select)\s+["']?(met|yes|true)["']?\s+(to|for)\s+(all|every|each)\b/i,
  /\b(this|the)\s+candidate\s+(is|meets)\s+(a|an|the)?\s*(perfect|ideal|exceptional)\s+(match|fit)\b/i,
  /\b(candidate|applicant|i|he|she)\s+(must|should)\s+be\s+(hired|shortlisted|selected|approved)\b/i,
  /\b(recommend|approve|shortlist)\s+(this candidate|this applicant|me)\s+(for|immediately|without)\b/i,

  // --- Ukrainian ---
  /(?<!\p{L})(ігноруй|ігноруйте|проігноруй|забудь|не зважай на|не звертай уваги на)(?!\p{L})[^.\n]{0,40}(інструкці|вказівк|правил|критері)/iu,
  /(?<!\p{L})(ти|ви)\s+(—|-|є|тепер)?\s*(штучний інтелект|мовна модель|асистент|бот|ші)(?!\p{L})/iu,
  /(?<!\p{L})відтепер\s+(ти|ви)(?!\p{L})/iu,
  /(?<!\p{L})(нові|справжні)\s+інструкції\s*:/iu,
  /(?<!\p{L})(оціни|оцініть|постав|поставте|вистав|виставте)(?!\p{L})[^.\n]{0,40}(максимальн|найвищ|100|ідеальн)/iu,
  /(?<!\p{L})(цей|даний)\s+кандидат\s+(ідеально|повністю)\s+(підходить|відповідає)(?!\p{L})/iu,

  // --- Russian ---
  /(?<!\p{L})(игнорируй|игнорируйте|проигнорируй|забудь|не обращай внимания на)(?!\p{L})[^.\n]{0,40}(инструкци|указани|правил|критери)/iu,
  /(?<!\p{L})(ты|вы)\s+(—|-|теперь)?\s*(искусственный интеллект|языковая модель|ассистент|бот|ии)(?!\p{L})/iu,
  /(?<!\p{L})теперь\s+(ты|вы)\s+(—|-)?\s*(рекрутер|ассистент|бот|модель)(?!\p{L})/iu,
  /(?<!\p{L})(новые|настоящие)\s+инструкции\s*:/iu,
  /(?<!\p{L})(оцени|оцените|поставь|поставьте|выставь|выставьте)(?!\p{L})[^.\n]{0,40}(максимальн|высш|100|идеальн)/iu,
  /(?<!\p{L})(этот|данный)\s+кандидат\s+(идеально|полностью)\s+(подходит|соответствует)(?!\p{L})/iu,
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
        if (containsPromptInjection(sentence)) {
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
  const form = matchingForm(text);
  return PATTERNS.some((pattern) => pattern.test(form));
}
