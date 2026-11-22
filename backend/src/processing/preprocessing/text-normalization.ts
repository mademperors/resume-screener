/*
 * Text clean-up before anything reads the resume, so contacts, personal data
 * and instructions to AI are found however the characters were written, and
 * so the time the analysis takes doesn't depend on how the file was built.
 */

/**
 * Characters that draw nothing: zero-width spaces and joiners, the soft
 * hyphen, word joiners and invisible operators, bidirectional controls,
 * variation selectors and the byte-order mark. Used to split words so a
 * filter doesn't see them (a zero-width space inside "Ignore") or to reorder
 * what is displayed.
 */
const INVISIBLE =
  // oxlint-disable-next-line no-misleading-character-class -- single code points on purpose
  /[\u{AD}\u{34F}\u{61C}\u{180E}\u{200B}-\u{200F}\u{202A}-\u{202E}\u{2060}-\u{2064}\u{2066}-\u{2069}\u{FE00}-\u{FE0F}\u{FEFF}\u{E0100}-\u{E01EF}]/gu;

/** Control characters other than tab and line breaks. */
// oxlint-disable-next-line no-control-regex -- removing them is the point
const CONTROL = /[\u{0}-\u{8}\u{B}\u{C}\u{E}-\u{1F}\u{7F}-\u{9F}]/gu;

/**
 * Unicode tag characters mirror ASCII but are invisible; language models
 * still read them, which makes them a way to smuggle instructions.
 */
const TAG_RUN = /[\u{E0000}-\u{E007F}]+/gu;

export interface NormalizedText {
  text: string;
  /** Text written in invisible tag characters, decoded. */
  invisible: string[];
}

/**
 * NFKC (fullwidth, ligatures and styled letters become plain ones: "ﬁ" ->
 * "fi", "𝐈𝐠𝐧𝐨𝐫𝐞" -> "Ignore"), without invisible and control characters.
 */
export function normalizeText(text: string): NormalizedText {
  const invisible: string[] = [];
  const visible = text
    .replace(TAG_RUN, (run) => {
      const decoded = Array.from(run, (char) => char.codePointAt(0)! - 0xe0000)
        .filter((code) => code >= 0x20 && code < 0x7f)
        .map((code) => String.fromCharCode(code))
        .join('')
        .trim();
      if (decoded) {
        invisible.push(decoded);
      }
      return '';
    })
    .replace(INVISIBLE, '')
    .replace(CONTROL, ' ')
    .normalize('NFKC');
  return { text: visible, invisible };
}

/** Cyrillic and Greek letters that look like Latin ones. */
const LATIN_LOOKALIKES: Record<string, string> = {
  а: 'a',
  е: 'e',
  к: 'k',
  о: 'o',
  р: 'p',
  с: 'c',
  у: 'y',
  х: 'x',
  і: 'i',
  ї: 'i',
  ј: 'j',
  ѕ: 's',
  ԁ: 'd',
  ӏ: 'l',
  А: 'A',
  В: 'B',
  Е: 'E',
  К: 'K',
  М: 'M',
  Н: 'H',
  О: 'O',
  Р: 'P',
  С: 'C',
  Т: 'T',
  У: 'Y',
  Х: 'X',
  І: 'I',
  Ј: 'J',
  Ѕ: 'S',
  α: 'a',
  ε: 'e',
  ι: 'i',
  ο: 'o',
  ρ: 'p',
  υ: 'u',
  Α: 'A',
  Β: 'B',
  Ε: 'E',
  Ι: 'I',
  Κ: 'K',
  Μ: 'M',
  Ν: 'N',
  Ο: 'O',
  Ρ: 'P',
  Τ: 'T',
  Χ: 'X',
};

/**
 * A form of the text for pattern matching only, never shown or evaluated:
 * Latin words with Cyrillic or Greek look-alike letters ("іgnоre") are
 * spelled in Latin, and words spelled out letter by letter ("i g n o r e")
 * are joined. Words written in one script are left alone, so Ukrainian and
 * Russian stay as they are.
 */
export function matchingForm(text: string): string {
  return normalizeText(text)
    .text.replace(/\S+/g, (word) =>
      /\p{Script=Latin}/u.test(word) &&
      /[\p{Script=Cyrillic}\p{Script=Greek}]/u.test(word)
        ? word.replace(/./gu, (char) => LATIN_LOOKALIKES[char] ?? char)
        : word,
    )
    .replace(/(?<!\S)(?:\p{L} ){3,}\p{L}(?!\S)/gu, (letters) =>
      letters.replace(/ /g, ''),
    );
}

/**
 * Most text the analysis reads. A long resume is a few tens of thousands of
 * characters; anything beyond this is cut.
 */
export const MAX_ANALYSED_CHARS = 100_000;
/**
 * Longest "word" (run without spaces) kept whole. Real words and most links
 * are far shorter; a run of hundreds of thousands of letters makes pattern
 * matching slow (seconds), so longer runs are cut to this length.
 */
export const MAX_WORD_CHARS = 200;

export interface AnalysedText {
  text: string;
  /** Characters cut off the end. */
  cutChars: number;
  /** Words shortened to MAX_WORD_CHARS. */
  cutWords: number;
}

/**
 * Bounds the work every later step does: at most MAX_ANALYSED_CHARS
 * characters, no word longer than MAX_WORD_CHARS. The same input always
 * gives the same output.
 */
export function limitForAnalysis(text: string): AnalysedText {
  const head = text.slice(0, MAX_ANALYSED_CHARS);
  let cutWords = 0;
  const limited = head.replace(
    new RegExp(`\\S{${MAX_WORD_CHARS + 1},}`, 'g'),
    (word) => {
      cutWords += 1;
      return word.slice(0, MAX_WORD_CHARS);
    },
  );
  return { text: limited, cutChars: text.length - head.length, cutWords };
}
