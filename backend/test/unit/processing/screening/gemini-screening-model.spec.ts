import { buildRequirements } from '@src/jobs/requirements.js';
import {
  describeFailure,
  PermanentProcessingError,
  ScreeningModelUnavailableError,
} from '@src/processing/processing-errors.js';
import {
  GeminiScreeningModel,
  MAX_RESUME_CHARS,
  type GeminiOptions,
} from '@src/processing/screening/gemini-screening-model.js';

const NOW = new Date('2026-11-19T00:00:00Z');
const requirements = buildRequirements({
  requiredSkills: ['TypeScript', 'PostgreSQL'],
  preferredSkills: ['Docker'],
  minExperienceYears: 3,
});
const RESUME = 'Backend engineer with 5+ years of commercial experience.';

function choice(value: 'met' | 'not_met', confidence: number) {
  return { type: 'choice', choice: value, confidence, probabilities: {} };
}

function reply(body: unknown, status = 200): Response {
  return new Response(typeof body === 'string' ? body : JSON.stringify(body), {
    status,
  });
}

interface Call {
  url: string;
  init: RequestInit;
  body: {
    model: string;
    input: string;
    questions: Record<string, { instructions: string }>;
  };
}

function setup(respond: () => Response) {
  const calls: Call[] = [];
  const fetchMock = ((url: string, init: RequestInit) => {
    calls.push({ url, init, body: JSON.parse(init.body as string) });
    return Promise.resolve(respond());
  }) as unknown as typeof fetch;
  const options: GeminiOptions = {
    apiKey: 'secret-key',
    apiUrl: 'https://gemini.test/v1beta/decisions',
    model: 'gemini-decision-1',
    timeoutMs: 5000,
    fetch: fetchMock,
    now: () => NOW,
  };
  return { model: new GeminiScreeningModel(options), calls };
}

const okAnswers = {
  model: 'gemini-decision-1',
  answers: {
    r0: choice('met', 0.9),
    r1: choice('not_met', 0.7),
    r2: choice('met', 0.5),
  },
};

function failure(model: GeminiScreeningModel, resumeText = RESUME) {
  return model
    .evaluate({ resumeText, requirements })
    .then(() => undefined)
    .catch((error: unknown) => error);
}

describe('GeminiScreeningModel', () => {
  it('asks one choice question per skill and turns the answers into verdicts', async () => {
    const { model, calls } = setup(() => reply(okAnswers));

    const result = await model.evaluate({ resumeText: RESUME, requirements });

    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe('https://gemini.test/v1beta/decisions');
    expect(calls[0].init.method).toBe('POST');
    expect(calls[0].init.headers).toMatchObject({
      'x-goog-api-key': 'secret-key',
    });
    expect(calls[0].body.model).toBe('gemini-decision-1');
    expect(calls[0].body.input).toContain(RESUME);
    expect(Object.keys(calls[0].body.questions)).toEqual(['r0', 'r1', 'r2']);
    expect(calls[0].body.questions.r0).toMatchObject({
      type: 'choice',
      criteria: { met: expect.any(String), not_met: expect.any(String) },
    });
    expect(calls[0].body.questions.r0.instructions).toContain('TypeScript');

    expect(result.modelName).toBe('gemini');
    expect(result.modelVersion).toBe('gemini-decision-1');
    expect(result.verdicts).toEqual([
      {
        requirementId: 'skill:typescript',
        met: true,
        confidence: 0.9,
        evidence: 'Found in the resume',
      },
      {
        requirementId: 'skill:postgresql',
        met: false,
        confidence: 0.7,
        evidence: null,
      },
      {
        requirementId: 'skill:docker',
        met: true,
        confidence: 0.5,
        evidence: 'Found in the resume',
      },
      {
        requirementId: 'experience',
        met: true,
        confidence: 0.9,
        evidence: 'States 5 years of experience',
      },
    ]);
    expect(result.skills).toEqual(
      expect.arrayContaining(['TypeScript', 'Docker']),
    );
    expect(result.skills).not.toContain('PostgreSQL');
    expect(result.experienceYears).toBe(5);
  });

  it('reads experience from the text and does not ask the model about it', async () => {
    const { model, calls } = setup(() => reply(okAnswers));
    await model.evaluate({ resumeText: RESUME, requirements });
    expect(JSON.stringify(calls[0].body.questions)).not.toContain('years');
  });

  it('does not call the API when only experience is required', async () => {
    const { model, calls } = setup(() => reply(okAnswers));
    const result = await model.evaluate({
      resumeText: RESUME,
      requirements: buildRequirements({
        requiredSkills: [],
        preferredSkills: [],
        minExperienceYears: 2,
      }),
    });
    expect(calls).toHaveLength(0);
    expect(result.verdicts).toHaveLength(1);
    expect(result.modelVersion).toBe('gemini-decision-1');
  });

  it('records the model version the API reports', async () => {
    const { model } = setup(() =>
      reply({ ...okAnswers, model: 'gemini-decision-2' }),
    );
    const result = await model.evaluate({ resumeText: RESUME, requirements });
    expect(result.modelVersion).toBe('gemini-decision-2');
  });

  it('keeps confidence within 0..1', async () => {
    const { model } = setup(() =>
      reply({
        answers: {
          r0: choice('met', 1.4),
          r1: choice('not_met', -0.2),
          r2: choice('met', 0.5),
        },
      }),
    );
    const { verdicts } = await model.evaluate({
      resumeText: RESUME,
      requirements,
    });
    expect(verdicts.map((v) => v.confidence).slice(0, 2)).toEqual([1, 0]);
  });

  it('cuts a very long resume before sending it', async () => {
    const { model, calls } = setup(() => reply(okAnswers));
    await model.evaluate({
      resumeText: 'Backend engineer with TypeScript. '.repeat(
        Math.ceil((MAX_RESUME_CHARS * 2) / 34),
      ),
      requirements,
    });
    expect(calls[0].body.input.length).toBeLessThan(MAX_RESUME_CHARS + 50);
  });

  it('retries on rate limits, overload and server errors', async () => {
    for (const status of [429, 529, 500, 503]) {
      const { model } = setup(() => reply('busy', status));
      const error = await failure(model);
      expect(error).toBeInstanceOf(ScreeningModelUnavailableError);
      expect(describeFailure(error).retryable).toBe(true);
    }
  });

  it('retries when the request fails or times out', async () => {
    const { model } = setup(() => {
      throw new TypeError('fetch failed');
    });
    expect(await failure(model)).toBeInstanceOf(ScreeningModelUnavailableError);
  });

  it('retries when the connection drops while the answer is being read', async () => {
    const { model } = setup(() => {
      const response = reply(okAnswers);
      response.json = () => Promise.reject(new TypeError('terminated'));
      return response;
    });
    expect(await failure(model)).toBeInstanceOf(ScreeningModelUnavailableError);
  });

  it('does not retry requests the API rejects, and keeps the details private', async () => {
    for (const status of [400, 413, 422]) {
      const { model } = setup(() => reply('bad request body', status));
      const error = await failure(model);
      expect(error).toBeInstanceOf(PermanentProcessingError);
      expect(describeFailure(error).retryable).toBe(false);
      expect(describeFailure(error).userMessage).not.toContain('bad request');
    }
  });

  it('treats the 400 Google sends for an unknown key as a credentials problem', async () => {
    const { model } = setup(() =>
      reply(
        '{"error":{"message":"API key not valid. Please pass a valid API key."}}',
        400,
      ),
    );
    const failureInfo = describeFailure(await failure(model));
    expect(failureInfo.retryable).toBe(false);
    expect(failureInfo.userMessage).toContain('API key');
  });

  it('names the API key when Google refuses it, without printing the key', async () => {
    const { model } = setup(() => reply('no', 401));
    const error = await failure(model);
    expect(describeFailure(error).retryable).toBe(false);
    expect(describeFailure(error).userMessage).toContain('API key');
    expect((error as Error).message).not.toContain('secret-key');
  });

  it('fails permanently on an answer it cannot use', async () => {
    const broken = [
      'not json',
      { nothing: true },
      { answers: { r0: choice('met', 0.9) } },
      {
        answers: {
          r0: choice('met', 0.9),
          r1: { type: 'choice', choice: 'maybe', confidence: 0.5 },
          r2: choice('met', 0.5),
        },
      },
      {
        answers: {
          r0: choice('met', 0.9),
          r1: { type: 'noul', noul: 0.4 },
          r2: choice('met', 0.5),
        },
      },
    ];
    for (const body of broken) {
      const { model } = setup(() => reply(body));
      expect(await failure(model)).toBeInstanceOf(PermanentProcessingError);
    }
  });
});
