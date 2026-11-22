import { normalizeWhitespace } from '../extraction/text-collector.js';
import { isKnownSkillWord } from '../skills.js';
import { EMAIL, PHONE, URL } from './contacts.js';

/*
 * Personal data that must not reach the screening model (FR 2.7.3, NFR 5.3):
 * contacts, and facts that only identify the person or could bias the
 * evaluation (age, gender, family, nationality, address, documents).
 *
 * Patterns are deliberately specific: skills, years of experience, job dates
 * and company names must survive. `\b` doesn't work next to Cyrillic, hence
 * the (?<!\p{L}) look-arounds.
 */

/** `Label: value` lines, removed whole. */
const PERSONAL_DATA_LINE =
  /^\s*(?:date of birth|birth ?date|place of birth|born|dob|age|gender|sex|pronouns|nationality|citizenship|marital status|family status|children|religion|photo|address|location|passport|дата народження|місце народження|народився|народилася|вік|стать|національність|громадянство|сімейний стан|діти|віросповідання|фото|адреса|місце проживання|паспорт|дата рождения|место рождения|возраст|пол|национальность|гражданство|семейное положение|дети|вероисповедание|адрес)\b\s*[:\-–].*$/gimu;

/** The same facts written in running text. */
const PERSONAL_DATA_PHRASES: RegExp[] = [
  // Date of birth: "born 12 March 1990", "DOB 01.02.1990", "народився 12.03.1990 р."
  /(?<!\p{L})(?:born|date of birth|birth ?date|d\.?o\.?b\.?|народи(?:вся|лася)|дата народження|родил(?:ся|ась)|дата рождения)(?!\p{L})[^\n;]{0,40}?(?:19|20)\d{2}(?!\d)(?:\s*(?:р\.|г\.|року|года))?/giu,
  // Age: "32 years old", "32 y.o.", "aged 32", "вік: 32", "мені 32 роки"
  /(?<![\p{L}\p{N}])\d{2}\s*(?:years?|yrs?)[\s-]*old(?!\p{L})/giu,
  /(?<![\p{L}\p{N}])\d{2}\s*y\s*[./]\s*o\.?(?!\p{L})/giu,
  /(?<!\p{L})(?:aged?|вік|возраст)\s*[:\-–]?\s*\d{2}(?!\d)(?:\s*(?:years?|роки|років|рік|года|лет|год)(?!\p{L}))?/giu,
  /(?<!\p{L})(?:мені|мне)\s+\d{2}\s*(?:роки|років|рік|года|лет|год)(?!\p{L})/giu,
  // Gender and pronouns.
  /(?<!\p{L})(?:male|female|non-binary|чоловіча|жіноча|мужской|женский)(?!\p{L})/giu,
  /(?<!\p{L})(?:she|he|they)\s*\/\s*(?:her|him|them)(?:\s*\/\s*(?:hers|his|theirs))?(?!\p{L})/giu,
  // Marital status and children. Not "single" or "engaged": "single sign-on",
  // "engaged with stakeholders".
  /(?<!\p{L})(?:married|divorced|widowed|неодружен(?:ий|а)|одружен(?:ий|а)|розлучен(?:ий|а)|незаміжня|заміжня|не женат|женат|не замужем|замужем|развед[её]н(?:а)?|холост(?:ой|ая|а)?|вдов(?:ець|ец|а))(?!\p{L})/giu,
  /(?<!\p{L})(?:\d+|no|one|two|three|four)\s+(?:children|kids|child)(?!\p{L})/giu,
  /(?<!\p{L})(?:\d+|без|немає|нет|одн[аеуо]|один|одного|дво[єе]|тро[єе]|двох|трьох)\s+(?:дітей|дитини|дитину|дитина|детей|ребенка|ребёнка|ребенок|ребёнок)(?!\p{L})/giu,
  // Citizenship and nationality: "Ukrainian citizen", "citizenship of Poland",
  // "громадянство України". Case-sensitive so "for citizen services" stays.
  /(?<!\p{L})(?:\p{Lu}\p{L}*(?:ian|ish|ese|an|ic|ch|i)|EU|US|UK)\s+citizen(?:ship)?(?!\p{L})/gu,
  /(?<!\p{L})(?:[Cc]itizen(?:ship)?|[Nn]ationality)\s+(?:of\s+(?:the\s+)?)?\p{Lu}\p{L}+(?:\s+\p{Lu}\p{L}+)?/gu,
  /(?<!\p{L})(?:громадян(?:ин|ка|ство)|гражданин|гражданка|гражданство|національність|национальность)(?!\p{L})\s*[:\-–]?\s*\p{L}+/giu,
  // Street addresses: "12 Baker Street, Apt 4", "вул. Хрещатик, 22, кв. 5".
  /(?<![\p{L}\p{N}])\d{1,5}[A-Za-z]?\s+(?:\p{Lu}[\p{L}'’.-]*\s+){1,3}(?:Street|St|Avenue|Ave|Road|Rd|Boulevard|Blvd|Lane|Ln|Drive|Dr|Court|Ct|Place|Pl|Square|Sq|Way|Terrace|Highway|Hwy)\.?(?!\p{L})(?:,?\s*(?:Apt|Apartment|Suite|Ste|Unit|Flat)\.?\s*#?\s*[\p{L}\p{N}-]+)?/gu,
  /(?<!\p{L})(?:вул\.|вулиця|ул\.|улица|просп\.|проспект|пров\.|провулок|пер\.|переулок|бульв\.|бульвар|пл\.|площа|площадь|наб\.|набережна|набережная|шосе|шоссе)\s*[\p{L}\p{N}'’ .-]{1,40}?,?\s*(?:буд\.|будинок|д\.|дом)?\s*\d{1,4}\p{L}?(?:\s*[,/]?\s*(?:кв\.|квартира|оф\.)\s*\d{1,4})?/giu,
  // Social profiles: "Telegram: @jane", "Skype: jane.doe", and bare @handles
  // (emails are gone by now; "@nestjs/core" is a package, not a handle).
  /(?<!\p{L})(?:telegram|телеграм|tg|skype|whatsapp|viber|signal|discord|twitter|instagram|facebook|linkedin|github|gitlab)\s*:\s*@?[\w.\-/]+/giu,
  /(?<![\w@.])@[A-Za-z0-9_](?:[A-Za-z0-9_.]{1,30}[A-Za-z0-9_])?(?![\w/@])/g,
  // Identity documents and numbers: "Passport: FE123456", "ІПН 1234567890",
  // a Ukrainian passport "АВ 123456", a US SSN "123-45-6789".
  /(?<!\p{L})(?:passport|паспорт|id card|id number|national id|ідентифікаційний код|іпн|рнокпп|инн|tax (?:id|number)|ssn|social security number|pesel)(?!\p{L})(?:\s*(?:no\.?|number|№|#|серія|серия))?\s*[:\-–]?\s*\p{Lu}{0,3}\s?\d[\d -]{4,16}\d/giu,
  /(?<![\p{L}\p{N}])[А-ЯІЇЄҐ]{2}\s?\d{6}(?![\p{L}\p{N}])/gu,
  /(?<!\d)\d{3}-\d{2}-\d{4}(?!\d)/g,
];

/** Removes contacts and personal data so they can't affect the evaluation. */
export function redactPersonalData(
  text: string,
  fullName: string | null,
): string {
  let result = text
    .replace(PERSONAL_DATA_LINE, '')
    .replace(EMAIL, '')
    .replace(URL, '');
  for (const pattern of PERSONAL_DATA_PHRASES) {
    result = result.replace(pattern, '');
  }
  result = result.replace(PHONE, (match) =>
    // Keep year ranges and short numbers ("2019 2023", "5 years"); longer
    // runs of digits are phone, ID or tax numbers.
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
  return normalizeWhitespace(
    // Separators left dangling by a removal: "Kyiv, , 2019" or "| |".
    result.replace(/^[\s,;|•·-]+$/gm, '').replace(/([,;|])\s*(?=[,;|])/g, ''),
  );
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
