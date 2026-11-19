import { writeFileSync } from 'node:fs';
import { generateOpenApiJson, OPENAPI_FILE } from './generate-openapi.js';

/**
 * `npm run openapi`: writes docs/openapi.json. Run it after changing any
 * endpoint or DTO and commit the file with the change; a unit test fails
 * while it is out of date.
 */
writeFileSync(OPENAPI_FILE, await generateOpenApiJson());
console.log(`Wrote ${OPENAPI_FILE}`);
