import type { GeminiSettings } from '@src/config/screening.config.js';
import { GeminiDecisionsClient } from '@src/processing/screening/gemini-decisions-client.js';

/** A stubbed Gemini Decisions API for unit tests: records requests, answers as told. */

export const GEMINI_SETTINGS: GeminiSettings = {
  apiKey: 'secret-key',
  apiUrl: 'https://gemini.test/v1beta/decisions',
  model: 'gemini-decision-1',
  timeoutMs: 5000,
};

export interface GeminiCall {
  url: string;
  init: RequestInit;
  body: {
    model: string;
    input: string;
    questions: Record<string, { instructions: string }>;
  };
}

export function choice(value: 'met' | 'not_met', confidence: number) {
  return { type: 'choice', choice: value, confidence, probabilities: {} };
}

export function reply(
  body: unknown,
  status = 200,
  headers: Record<string, string> = {},
): Response {
  return new Response(typeof body === 'string' ? body : JSON.stringify(body), {
    status,
    headers,
  });
}

export function stubGemini(
  respond: () => Response,
  now: () => Date = () => new Date(),
) {
  const calls: GeminiCall[] = [];
  const fetchStub = ((url: string, init: RequestInit) => {
    calls.push({ url, init, body: JSON.parse(init.body as string) });
    return Promise.resolve(respond());
  }) as unknown as typeof fetch;
  const client = new GeminiDecisionsClient(GEMINI_SETTINGS, {
    fetch: fetchStub,
    now,
  });
  return { client, calls };
}
