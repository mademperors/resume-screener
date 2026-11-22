import { screeningConfig } from '@src/config/screening.config.js';
import { GeminiScreeningModel } from '@src/processing/screening/gemini-screening-model.js';
import { MockScreeningModel } from '@src/processing/screening/mock-screening-model.js';
import { createScreeningModel } from '@src/processing/screening/screening-model.provider.js';

describe('createScreeningModel', () => {
  it('builds the model SCREENING_MODEL names', () => {
    expect(
      createScreeningModel(screeningConfig.load({ SCREENING_MODEL: 'mock' })),
    ).toBeInstanceOf(MockScreeningModel);
    expect(
      createScreeningModel(
        screeningConfig.load({
          SCREENING_MODEL: 'gemini',
          GEMINI_API_KEY: 'key',
          GEMINI_API_URL: 'https://gemini.test/v1beta/decisions',
          GEMINI_MODEL: 'gemini-decision-1',
          GEMINI_TIMEOUT_MS: '15000',
        }),
      ),
    ).toBeInstanceOf(GeminiScreeningModel);
  });
});
