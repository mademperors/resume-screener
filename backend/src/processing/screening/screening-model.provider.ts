import type { FactoryProvider } from '@nestjs/common';
import {
  screeningConfig,
  type ScreeningSettings,
} from '../../config/screening.config.js';
import { ScreeningModel } from '../stages.js';
import { GeminiDecisionsClient } from './gemini-decisions-client.js';
import { GeminiScreeningModel } from './gemini-screening-model.js';
import { MockScreeningModel } from './mock-screening-model.js';

type ModelName = ScreeningSettings['model'];
type SettingsOf<Name extends ModelName> = Extract<
  ScreeningSettings,
  { model: Name }
>;

/**
 * Every screening model, by its SCREENING_MODEL name. To add one: implement
 * ScreeningModel, add its name and settings to screening.config.ts, and add
 * it here; the compiler points out anything missing.
 */
const SCREENING_MODELS: {
  [Name in ModelName]: (settings: SettingsOf<Name>) => ScreeningModel;
} = {
  mock: () => new MockScreeningModel(),
  gemini: ({ gemini }) =>
    new GeminiScreeningModel(new GeminiDecisionsClient(gemini)),
};

export function createScreeningModel(
  settings: ScreeningSettings,
): ScreeningModel {
  // Each factory takes its own settings; the record's type ties them together.
  const create = SCREENING_MODELS[settings.model] as (
    settings: ScreeningSettings,
  ) => ScreeningModel;
  return create(settings);
}

/** Binds ScreeningModel to the model chosen with SCREENING_MODEL. */
export const screeningModelProvider: FactoryProvider<ScreeningModel> = {
  provide: ScreeningModel,
  inject: [screeningConfig.KEY],
  useFactory: createScreeningModel,
};
