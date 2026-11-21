import type { CandidateContacts } from '../stages.js';

export const EMAIL = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;
// International or local numbers with at least 9 digits, allowing separators.
export const PHONE =
  /(?<![\w+])(?:\+?\d{1,3}[\s.-]?)?(?:\(\d{1,4}\)[\s.-]?)?\d{2,4}(?:[\s.-]?\d{2,4}){2,4}(?![\w])/g;
export const URL =
  /\b(?:https?:\/\/|www\.)\S+|\b(?:linkedin\.com|github\.com|gitlab\.com|t\.me|facebook\.com|instagram\.com)\/\S+/gi;

const LOCATION_LABEL =
  /^\s*(?:location|address|city|based in|адреса|місто|місце проживання|адрес|город)\s*[:\-–]\s*(.+)$/im;

/** Lines that start a resume but aren't a name. */
const NOT_A_NAME =
  /^(?:curriculum vitae|resume|résumé|cv|summary|profile|contacts?|about me|резюме|про мене|контакти)$/i;

/** A line with one of these words is a job title, not a name. */
const TITLE_WORDS =
  /(?<!\p{L})(?:developer|engineer|manager|senior|junior|middle|lead|head|designer|analyst|specialist|architect|consultant|intern|director|officer|administrator|tester|qa|devops|scientist|programmer|full[- ]?stack|front[- ]?end|back[- ]?end|розробник|інженер|менеджер|аналітик|дизайнер|разработчик|инженер)(?!\p{L})/iu;

// 2–4 capitalised words of letters (Latin or Cyrillic), hyphens or apostrophes.
const NAME_LINE =
  /^(?:[A-ZÀ-ÖØ-ÞА-ЯІЇЄҐ][a-zà-öø-ÿа-яіїєґ'’-]+|[A-ZА-ЯІЇЄҐ]{2,})(?:\s+(?:[A-ZÀ-ÖØ-ÞА-ЯІЇЄҐ][a-zà-öø-ÿа-яіїєґ'’-]+|[A-ZА-ЯІЇЄҐ]{2,}|[A-ZА-ЯІЇЄҐ]\.)){1,3}$/;

export function findContacts(text: string): CandidateContacts {
  return {
    fullName: findName(text),
    email: text.match(EMAIL)?.[0]?.toLowerCase() ?? null,
    phone: findPhone(text),
    location: LOCATION_LABEL.exec(text)?.[1]?.trim().slice(0, 200) || null,
  };
}

/** The first short line near the top that looks like a person's name. */
function findName(text: string): string | null {
  const lines = text
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(0, 8);
  for (const line of lines) {
    if (NOT_A_NAME.test(line) || TITLE_WORDS.test(line) || line.length > 60) {
      continue;
    }
    if (NAME_LINE.test(line)) {
      return titleCase(line).slice(0, 200);
    }
  }
  return null;
}

function findPhone(text: string): string | null {
  for (const match of text.matchAll(PHONE)) {
    const digits = match[0].replace(/\D/g, '');
    // Skip year ranges such as "2019 2023" and short numbers.
    if (
      digits.length >= 9 &&
      digits.length <= 15 &&
      !/^(19|20)\d{2}(19|20)\d{2}$/.test(digits)
    ) {
      return match[0].trim();
    }
  }
  return null;
}

function titleCase(name: string): string {
  return name
    .split(/\s+/)
    .map((word) =>
      word === word.toUpperCase() && word.length > 1
        ? word.charAt(0) + word.slice(1).toLowerCase()
        : word,
    )
    .join(' ');
}
