import { buildRequirements } from '@src/jobs/requirements.js';
import { PermanentProcessingError } from '@src/processing/processing-errors.js';
import {
  GeminiScreeningModel,
  INFERRED_EVIDENCE,
  MAX_RESUME_CHARS,
} from '@src/processing/screening/gemini-screening-model.js';
import { choice, reply, stubGemini } from '../../../support/gemini-api.js';

const NOW = new Date('2026-11-19T00:00:00Z');
const requirements = buildRequirements({
  requiredSkills: ['TypeScript', 'PostgreSQL'],
  preferredSkills: ['Docker'],
  minExperienceYears: 3,
});
const RESUME = [
  'Backend engineer with 5+ years of commercial experience.',
  'Built payment APIs in TypeScript and Node.js.',
  'Containerised services, deployed with Kubernetes.',
].join('\n');

const okAnswers = {
  model: 'gemini-decision-1',
  answers: {
    r0: choice('met', 0.9),
    r1: choice('not_met', 0.7),
    r2: choice('met', 0.5),
  },
};

function setup(respond: () => Response) {
  const { client, calls } = stubGemini(respond);
  return { model: new GeminiScreeningModel(client, () => NOW), calls };
}

describe('GeminiScreeningModel', () => {
  it('asks one choice question per skill and turns the answers into verdicts', async () => {
    const { model, calls } = setup(() => reply(okAnswers));

    const result = await model.evaluate({ resumeText: RESUME, requirements });

    expect(calls).toHaveLength(1);
    expect(calls[0].body.input).toBe(`Resume:\n${RESUME}`);
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
        evidence: 'Built payment APIs in TypeScript and Node.js.',
      },
      {
        requirementId: 'skill:postgresql',
        met: false,
        confidence: 0.7,
        evidence: null,
      },
      {
        // Met, but the resume never names Docker.
        requirementId: 'skill:docker',
        met: true,
        confidence: 0.5,
        evidence: INFERRED_EVIDENCE,
      },
      {
        requirementId: 'experience',
        met: true,
        confidence: 0.9,
        evidence: 'States 5 years of experience',
      },
    ]);
    expect(result.skills).toEqual(
      expect.arrayContaining(['TypeScript', 'Docker', 'Node.js', 'Kubernetes']),
    );
    expect(result.skills).not.toContain('PostgreSQL');
    expect(result.experienceYears).toBe(5);
  });

  it('quotes the mention behind a "not met" too', async () => {
    const { model } = setup(() =>
      reply({
        answers: {
          r0: choice('not_met', 0.8),
          r1: choice('not_met', 0.8),
          r2: choice('not_met', 0.8),
        },
      }),
    );
    const { verdicts } = await model.evaluate({
      resumeText: 'Java developer. Would like to learn Postgres next year.',
      requirements,
    });
    expect(verdicts[1]).toMatchObject({
      met: false,
      evidence: 'Java developer. Would like to learn Postgres next year.',
    });
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

  it('fails permanently when an answer is missing or has the wrong shape', async () => {
    const broken = [
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
      await expect(
        model.evaluate({ resumeText: RESUME, requirements }),
      ).rejects.toBeInstanceOf(PermanentProcessingError);
    }
  });
});
