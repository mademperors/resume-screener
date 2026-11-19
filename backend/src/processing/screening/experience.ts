export interface ExperienceEstimate {
  years: number;
  /** How the years were found; decides the confidence. */
  source: 'stated' | 'date-ranges';
}

const UNIT = String.raw`(?:years?|yrs?|роки|років|рік|года|лет|год)`;
const STATED = [
  // "5+ years of commercial experience", "7 років досвіду"
  new RegExp(
    String.raw`(\d{1,2}(?:[.,]\d)?)\s*\+?\s*${UNIT}(?:\s+of)?(?:\s+(?:commercial|professional|industry|relevant|work|working|hands-on|total))?\s+(?:experience|досвіду|опыта)`,
    'giu',
  ),
  // "Experience: 5 years"
  new RegExp(
    String.raw`(?:experience|досвід|опыт)[^\d\n]{0,20}(\d{1,2}(?:[.,]\d)?)\s*\+?\s*${UNIT}`,
    'giu',
  ),
];

const MONTHS: Record<string, number> = {
  jan: 0,
  feb: 1,
  mar: 2,
  apr: 3,
  may: 4,
  jun: 5,
  jul: 6,
  aug: 7,
  sep: 8,
  oct: 9,
  nov: 10,
  dec: 11,
  січ: 0,
  лют: 1,
  бер: 2,
  кві: 3,
  тра: 4,
  чер: 5,
  лип: 6,
  сер: 7,
  вер: 8,
  жов: 9,
  лис: 10,
  гру: 11,
  янв: 0,
  фев: 1,
  мар: 2,
  апр: 3,
  мая: 4,
  май: 4,
  июн: 5,
  июл: 6,
  авг: 7,
  сен: 8,
  окт: 9,
  ноя: 10,
  дек: 11,
};
const MONTH = String.raw`(?:([a-zа-яіїєґ]{3,})\.?\s+|(\d{1,2})[./])?`;
const NOW = String.raw`(present|now|current|today|теперішній час|дотепер|наразі|по теперішній|настоящее время|сейчас|по н\.?\s?в\.?)`;
const RANGE = new RegExp(
  String.raw`${MONTH}((?:19|20)\d{2})\s*(?:-|–|—|to|до|по)\s*(?:${MONTH}((?:19|20)\d{2})|${NOW})`,
  'giu',
);

const EDUCATION_HEADING =
  /^\s*(education|courses|certifications?|training|освіта|курси|сертифікати|образование|курсы)\s*:?\s*$/iu;
const WORK_HEADING =
  /^\s*(work experience|experience|employment( history)?|professional experience|career|work history|projects|досвід роботи|досвід|опыт работы|опыт)\s*:?\s*$/iu;

/**
 * Years of experience: the largest explicitly stated number, otherwise the
 * total length of job date ranges (overlaps merged, education skipped).
 */
export function estimateExperience(
  text: string,
  now: Date,
): ExperienceEstimate | null {
  const stated = STATED.flatMap((pattern) => [...text.matchAll(pattern)])
    .map((match) => Number(match[1].replace(',', '.')))
    .filter((years) => years > 0 && years <= 60);
  if (stated.length > 0) {
    return { years: Math.max(...stated), source: 'stated' };
  }

  const intervals: [number, number][] = [];
  let inEducation = false;
  for (const line of text.split('\n')) {
    if (EDUCATION_HEADING.test(line)) {
      inEducation = true;
      continue;
    }
    if (WORK_HEADING.test(line)) {
      inEducation = false;
      continue;
    }
    if (inEducation) {
      continue;
    }
    for (const match of line.matchAll(RANGE)) {
      const start = monthIndex(match[1], match[2], Number(match[3]), 0);
      const end = match[7]
        ? now.getFullYear() * 12 + now.getMonth()
        : monthIndex(match[4], match[5], Number(match[6]), 0);
      if (end > start && end - start <= 50 * 12) {
        intervals.push([start, end]);
      }
    }
  }
  const months = mergedLength(intervals);
  return months > 0
    ? { years: Math.round((months / 12) * 10) / 10, source: 'date-ranges' }
    : null;
}

function monthIndex(
  monthName: string | undefined,
  monthNumber: string | undefined,
  year: number,
  fallback: number,
): number {
  let month = fallback;
  if (monthName) {
    month = MONTHS[monthName.slice(0, 3).toLowerCase()] ?? fallback;
  } else if (monthNumber) {
    const value = Number(monthNumber) - 1;
    month = value >= 0 && value < 12 ? value : fallback;
  }
  return year * 12 + month;
}

function mergedLength(intervals: [number, number][]): number {
  const sorted = [...intervals].sort((a, b) => a[0] - b[0]);
  let total = 0;
  let current: [number, number] | null = null;
  for (const [start, end] of sorted) {
    if (current && start <= current[1]) {
      current[1] = Math.max(current[1], end);
    } else {
      if (current) {
        total += current[1] - current[0];
      }
      current = [start, end];
    }
  }
  return total + (current ? current[1] - current[0] : 0);
}
