import { normalizeSkill } from '../jobs/requirements.js';

/**
 * Common technologies, with other spellings, used to list a candidate's
 * skills and to match job skills written differently ("Postgres" for
 * "PostgreSQL"). Keys are display names.
 */
export const KNOWN_SKILLS: Record<string, string[]> = {
  JavaScript: ['js', 'ecmascript', 'es6'],
  TypeScript: ['ts'],
  'Node.js': ['node', 'nodejs', 'node js'],
  React: ['react.js', 'reactjs'],
  'Next.js': ['nextjs'],
  Angular: ['angularjs'],
  'Vue.js': ['vue', 'vuejs'],
  Svelte: [],
  HTML: ['html5'],
  CSS: ['css3'],
  Sass: ['scss'],
  'Tailwind CSS': ['tailwind'],
  Redux: [],
  GraphQL: [],
  REST: ['rest api', 'restful'],
  gRPC: [],
  NestJS: ['nest.js', 'nest js'],
  Express: ['express.js', 'expressjs'],
  Python: [],
  Django: [],
  Flask: [],
  FastAPI: [],
  Java: [],
  Spring: ['spring boot', 'springboot'],
  Kotlin: [],
  'C#': ['c sharp', 'csharp'],
  '.NET': ['dotnet', 'asp.net', '.net core'],
  'C++': ['cpp'],
  C: [],
  Go: ['golang'],
  Rust: [],
  Ruby: [],
  'Ruby on Rails': ['rails', 'ror'],
  PHP: [],
  Laravel: [],
  Swift: [],
  'Objective-C': [],
  Scala: [],
  Elixir: [],
  SQL: [],
  PostgreSQL: ['postgres', 'psql'],
  MySQL: [],
  MariaDB: [],
  'SQL Server': ['mssql', 'ms sql'],
  Oracle: [],
  SQLite: [],
  MongoDB: ['mongo'],
  Redis: [],
  Valkey: [],
  Elasticsearch: ['elastic search', 'opensearch'],
  Cassandra: [],
  DynamoDB: [],
  Kafka: ['apache kafka'],
  RabbitMQ: [],
  BullMQ: [],
  Docker: [],
  Kubernetes: ['k8s'],
  Helm: [],
  Terraform: [],
  Ansible: [],
  AWS: ['amazon web services'],
  GCP: ['google cloud', 'google cloud platform'],
  Azure: ['microsoft azure'],
  Linux: [],
  Git: [],
  'CI/CD': ['ci cd', 'continuous integration'],
  Jenkins: [],
  'GitHub Actions': [],
  'GitLab CI': [],
  Nginx: [],
  Microservices: ['microservice'],
  TypeORM: [],
  Prisma: [],
  Hibernate: [],
  Jest: [],
  Vitest: [],
  Cypress: [],
  Playwright: [],
  Selenium: [],
  'Machine Learning': ['ml'],
  'Deep Learning': [],
  PyTorch: [],
  TensorFlow: [],
  Pandas: [],
  NumPy: [],
  Spark: ['apache spark', 'pyspark'],
  Airflow: ['apache airflow'],
  Figma: [],
  Jira: [],
  Agile: [],
  Scrum: [],
  Android: [],
  iOS: [],
  'React Native': [],
  Flutter: [],
  Dart: [],
  English: ['english language'],
};

const ALL_KEYS = new Set(
  Object.entries(KNOWN_SKILLS).flatMap(([name, aliases]) => [
    normalizeSkill(name),
    ...aliases.map(normalizeSkill),
  ]),
);

/** Whether a word is a known skill name or alias, e.g. "Ruby". */
export function isKnownSkillWord(word: string): boolean {
  return ALL_KEYS.has(normalizeSkill(word));
}

/** Every spelling of a skill: itself plus aliases if it is a known skill. */
export function spellingsOf(skill: string): {
  exact: string;
  aliases: string[];
} {
  const key = normalizeSkill(skill);
  const known = Object.entries(KNOWN_SKILLS).find(
    ([name, aliases]) =>
      normalizeSkill(name) === key ||
      aliases.some((a) => normalizeSkill(a) === key),
  );
  if (!known) {
    return { exact: skill, aliases: [] };
  }
  const [name, aliases] = known;
  return {
    exact: skill,
    aliases: [name, ...aliases].filter((s) => normalizeSkill(s) !== key),
  };
}

/**
 * Finds a skill name as a whole term: "Go" must not match "good", "C" must
 * not match "C++", "Java" must not match "JavaScript".
 *
 * Short names and acronyms ("Go", "REST", "SQL") match only in the same case,
 * so "let's go" or "the rest" don't count; pass `caseSensitive` to force it.
 */
export function containsTerm(
  text: string,
  term: string,
  options: TermOptions = {},
): boolean {
  return termPattern(term, options).test(text);
}

export interface TermOptions {
  caseSensitive?: boolean;
}

/** Where a term first occurs as a whole term (see containsTerm), or null. */
export function findTerm(
  text: string,
  term: string,
  options: TermOptions = {},
): { index: number; length: number } | null {
  const match = termPattern(term, options).exec(text);
  return match ? { index: match.index, length: match[0].length } : null;
}

function termPattern(term: string, options: TermOptions): RegExp {
  const trimmed = term.trim();
  const caseSensitive =
    options.caseSensitive ??
    (trimmed.length <= 2 ||
      (trimmed.length <= 4 && trimmed === trimmed.toUpperCase()));
  const escaped = trimmed
    .replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    .replace(/\s+/g, '\\s+');
  return new RegExp(
    `(?<![\\p{L}\\p{N}+#.])${escaped}(?![\\p{L}\\p{N}+#]|\\.[\\p{L}\\p{N}])`,
    caseSensitive ? 'u' : 'iu',
  );
}
