import {
  IsIn,
  IsInt,
  IsNotEmpty,
  IsString,
  IsUrl,
  Min,
  ValidateIf,
} from 'class-validator';
import { defineConfig, type ConfigOf } from './define-config.js';

const SCREENING_MODELS = ['mock', 'gemini'] as const;
type ScreeningModelName = (typeof SCREENING_MODELS)[number];

const usesGemini = (env: ScreeningEnv) => env.SCREENING_MODEL === 'gemini';

class ScreeningEnv {
  /**
   * `mock` (keyword matching, for development and demos) or `gemini`
   * (Gemini Decision 1; needs GEMINI_API_KEY).
   */
  @IsIn(SCREENING_MODELS)
  SCREENING_MODEL: ScreeningModelName;

  /** Secret (https://aistudio.google.com/api-keys), in .env. */
  @ValidateIf(usesGemini)
  @IsString()
  @IsNotEmpty()
  GEMINI_API_KEY: string;

  @ValidateIf(usesGemini)
  @IsUrl({ require_tld: false, protocols: ['https', 'http'] })
  GEMINI_API_URL: string;

  /** Keep an exact id so a new release can't shift the calibrated thresholds. */
  @ValidateIf(usesGemini)
  @IsString()
  @IsNotEmpty()
  GEMINI_MODEL: string;

  /** Give up on one request after this long (it is retried later). */
  @ValidateIf(usesGemini)
  @IsInt()
  @Min(1000)
  GEMINI_TIMEOUT_MS: number;
}

export interface GeminiSettings {
  apiKey: string;
  apiUrl: string;
  model: string;
  timeoutMs: number;
}

export type ScreeningSettings =
  { model: 'mock' } | { model: 'gemini'; gemini: GeminiSettings };

/** Which model evaluates resumes, and how to reach it. */
export const screeningConfig = defineConfig(
  'screening',
  ScreeningEnv,
  (env): ScreeningSettings =>
    env.SCREENING_MODEL === 'gemini'
      ? {
          model: 'gemini',
          gemini: {
            apiKey: env.GEMINI_API_KEY,
            apiUrl: env.GEMINI_API_URL,
            model: env.GEMINI_MODEL,
            timeoutMs: env.GEMINI_TIMEOUT_MS,
          },
        }
      : { model: 'mock' },
);

export type ScreeningConfig = ConfigOf<typeof screeningConfig>;
