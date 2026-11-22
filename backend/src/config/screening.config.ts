import { z } from 'zod';
import { defineConfig, envVar, type ConfigOf } from './define-config.js';

export interface GeminiSettings {
  apiKey: string;
  apiUrl: string;
  model: string;
  timeoutMs: number;
}

export type ScreeningSettings =
  { model: 'mock' } | { model: 'gemini'; gemini: GeminiSettings };

/**
 * Which model evaluates resumes, and how to reach it: `mock` (keyword
 * matching, for development and demos) or `gemini` (Gemini Decision 1),
 * which then needs its settings, GEMINI_API_KEY included.
 */
export const screeningConfig = defineConfig(
  'screening',
  z.discriminatedUnion('SCREENING_MODEL', [
    z.object({ SCREENING_MODEL: z.literal('mock') }),
    z.object({
      SCREENING_MODEL: z.literal('gemini'),
      /** Secret (https://aistudio.google.com/api-keys), in .env. */
      GEMINI_API_KEY: envVar.text(),
      GEMINI_API_URL: envVar.url('https', 'http'),
      /** Keep an exact id so a new release can't shift the calibrated thresholds. */
      GEMINI_MODEL: envVar.text(),
      /** Give up on one request after this long (it is retried later). */
      GEMINI_TIMEOUT_MS: envVar.int().min(1000),
    }),
  ]),
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
