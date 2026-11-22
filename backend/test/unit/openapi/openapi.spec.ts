import 'reflect-metadata';
import { readFileSync } from 'node:fs';
import {
  generateOpenApiJson,
  OPENAPI_FILE,
} from '@src/openapi/generate-openapi.js';

describe('docs/openapi.json', () => {
  it('matches the API in the code (run `npm run openapi` if this fails)', async () => {
    const committed = readFileSync(OPENAPI_FILE, 'utf8').replace(/\r\n/g, '\n');
    const current = await generateOpenApiJson();
    // On failure, regenerate and commit the file with the API change.
    expect(
      committed === current,
      'docs/openapi.json is out of date: run `npm run openapi` and commit it',
    ).toBe(true);
  }, 60_000);
});
