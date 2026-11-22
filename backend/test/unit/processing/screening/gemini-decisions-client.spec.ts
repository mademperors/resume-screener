import {
  describeFailure,
  PermanentProcessingError,
  ScreeningModelUnavailableError,
} from '@src/processing/processing-errors.js';
import type { GeminiDecisionsClient } from '@src/processing/screening/gemini-decisions-client.js';
import { choice, reply, stubGemini } from '../../../support/gemini-api.js';

const NOW = new Date('2026-11-19T12:00:00Z');
const request = { input: 'Resume:\nTypeScript', questions: { r0: {} } };

function failure(client: GeminiDecisionsClient) {
  return client
    .decide(request)
    .then(() => undefined)
    .catch((error: unknown) => error);
}

describe('GeminiDecisionsClient', () => {
  it('posts the model, input and questions with the key', async () => {
    const { client, calls } = stubGemini(() =>
      reply({ model: 'gemini-decision-1', answers: { r0: choice('met', 1) } }),
    );
    const response = await client.decide(request);

    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe('https://gemini.test/v1beta/decisions');
    expect(calls[0].init.method).toBe('POST');
    expect(calls[0].init.headers).toMatchObject({
      'x-goog-api-key': 'secret-key',
    });
    expect(calls[0].body).toEqual({ model: 'gemini-decision-1', ...request });
    expect(response).toEqual({
      model: 'gemini-decision-1',
      answers: { r0: choice('met', 1) },
    });
  });

  it('reports the model version the API names, or the configured one', async () => {
    const named = stubGemini(() =>
      reply({ model: 'gemini-decision-2', answers: {} }),
    );
    expect((await named.client.decide(request)).model).toBe(
      'gemini-decision-2',
    );
    const unnamed = stubGemini(() => reply({ answers: {} }));
    expect((await unnamed.client.decide(request)).model).toBe(
      'gemini-decision-1',
    );
  });

  it('retries on rate limits, overload and server errors', async () => {
    for (const status of [429, 529, 500, 503]) {
      const { client } = stubGemini(() => reply('busy', status));
      const error = await failure(client);
      expect(error).toBeInstanceOf(ScreeningModelUnavailableError);
      expect(describeFailure(error).retryable).toBe(true);
      expect((error as ScreeningModelUnavailableError).retryAfterMs).toBeNull();
    }
  });

  it('carries the wait asked for in Retry-After, in seconds or as a date', async () => {
    const seconds = stubGemini(
      () => reply('slow down', 429, { 'Retry-After': '30' }),
      () => NOW,
    );
    expect(await failure(seconds.client)).toMatchObject({
      retryAfterMs: 30_000,
    });

    const date = stubGemini(
      () =>
        reply('down', 503, {
          'Retry-After': new Date(NOW.getTime() + 90_000).toUTCString(),
        }),
      () => NOW,
    );
    expect(await failure(date.client)).toMatchObject({ retryAfterMs: 90_000 });
  });

  it("reads the wait from Google's RetryInfo when there is no header", async () => {
    const { client } = stubGemini(() =>
      reply(
        {
          error: {
            code: 429,
            status: 'RESOURCE_EXHAUSTED',
            details: [
              { '@type': 'type.googleapis.com/google.rpc.QuotaFailure' },
              {
                '@type': 'type.googleapis.com/google.rpc.RetryInfo',
                retryDelay: '36.5s',
              },
            ],
          },
        },
        429,
      ),
    );
    expect(await failure(client)).toMatchObject({ retryAfterMs: 36_500 });
  });

  it('retries when the request fails or times out', async () => {
    const { client } = stubGemini(() => {
      throw new TypeError('fetch failed');
    });
    expect(await failure(client)).toBeInstanceOf(
      ScreeningModelUnavailableError,
    );
  });

  it('retries when the connection drops while the answer is being read', async () => {
    const { client } = stubGemini(() => {
      const response = reply({ answers: {} });
      response.json = () => Promise.reject(new TypeError('terminated'));
      return response;
    });
    expect(await failure(client)).toBeInstanceOf(
      ScreeningModelUnavailableError,
    );
  });

  it('does not retry requests the API rejects, and keeps the details private', async () => {
    for (const status of [400, 413, 422]) {
      const { client } = stubGemini(() => reply('bad request body', status));
      const error = await failure(client);
      expect(error).toBeInstanceOf(PermanentProcessingError);
      expect(describeFailure(error).retryable).toBe(false);
      expect(describeFailure(error).userMessage).not.toContain('bad request');
    }
  });

  it('treats the 400 Google sends for an unknown key as a credentials problem', async () => {
    const { client } = stubGemini(() =>
      reply(
        '{"error":{"message":"API key not valid. Please pass a valid API key."}}',
        400,
      ),
    );
    const failureInfo = describeFailure(await failure(client));
    expect(failureInfo.retryable).toBe(false);
    expect(failureInfo.userMessage).toContain('API key');
  });

  it('names the API key when Google refuses it, without printing the key', async () => {
    const { client } = stubGemini(() => reply('no', 401));
    const error = await failure(client);
    expect(describeFailure(error).retryable).toBe(false);
    expect(describeFailure(error).userMessage).toContain('API key');
    expect((error as Error).message).not.toContain('secret-key');
  });

  it('fails permanently on a body without answers', async () => {
    for (const body of ['not json', { nothing: true }, { answers: [] }]) {
      const { client } = stubGemini(() => reply(body));
      expect(await failure(client)).toBeInstanceOf(PermanentProcessingError);
    }
  });
});
