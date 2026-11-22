import { readdirSync } from 'node:fs';
import { ALL_CONFIGS } from '@src/config/config.module.js';

describe('AppConfigModule', () => {
  // A namespace left out of ALL_CONFIGS would only fail when something
  // injects it; catch that here instead.
  it('loads every config namespace in src/config', () => {
    const files = readdirSync('src/config').filter((name) =>
      name.endsWith('.config.ts'),
    );
    expect(ALL_CONFIGS).toHaveLength(files.length);
  });
});
