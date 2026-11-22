import { NestFactory } from '@nestjs/core';
import { fileURLToPath } from 'node:url';
import { buildOpenApiDocument, configureRouting } from '../setup.js';

/** Where the committed spec lives, relative to the backend folder. */
export const OPENAPI_FILE = fileURLToPath(
  new URL('../../docs/openapi.json', import.meta.url),
);

// Secrets have no defaults (.env.defaults has the rest); the spec doesn't
// depend on their values.
const PLACEHOLDER_ENV: Record<string, string> = {
  POSTGRES_PASSWORD: 'unused',
  JWT_SECRET: 'openapi-generation-placeholder-secret-0000',
  GOOGLE_CLIENT_ID: 'unused',
  S3_ACCESS_KEY_ID: 'unused',
  S3_SECRET_ACCESS_KEY: 'unused',
};

/**
 * Builds the OpenAPI document as stable, pretty JSON without connecting to
 * the database, Redis or storage: preview mode builds the module graph but
 * doesn't create providers.
 */
export async function generateOpenApiJson(): Promise<string> {
  for (const [name, value] of Object.entries(PLACEHOLDER_ENV)) {
    process.env[name] ??= value;
  }
  // Imported late: loading AppModule validates the environment.
  const { AppModule } = await import('../app.module.js');
  const app = await NestFactory.create(AppModule, {
    preview: true,
    logger: false,
    // Throw (e.g. a missing provider) instead of exiting the process silently.
    abortOnError: false,
  });
  try {
    configureRouting(app);
    return `${JSON.stringify(buildOpenApiDocument(app), null, 2)}\n`;
  } finally {
    await app.close();
  }
}
