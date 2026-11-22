import {
  INestApplication,
  ValidationPipe,
  VersioningType,
} from '@nestjs/common';
import {
  DocumentBuilder,
  SwaggerModule,
  type OpenAPIObject,
} from '@nestjs/swagger';
import {
  AllExceptionsFilter,
  validationExceptionFactory,
} from './common/http-exception.filter.js';

/** Shared by main.ts and integration tests so both run the same HTTP setup. */
export function configureApp(
  app: INestApplication,
  corsOrigins: readonly string[] = [],
): void {
  configureRouting(app);
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      exceptionFactory: validationExceptionFactory,
    }),
  );
  app.useGlobalFilters(new AllExceptionsFilter());
  if (corsOrigins.length > 0) {
    app.enableCors({ origin: [...corsOrigins] });
  }
  SwaggerModule.setup('api/docs', app, buildOpenApiDocument(app));
}

/** URL layout: everything under /api/v1. Also used to generate the spec. */
export function configureRouting(app: INestApplication): void {
  app.setGlobalPrefix('api');
  app.enableVersioning({ type: VersioningType.URI, defaultVersion: '1' });
}

/**
 * The OpenAPI document, built from the controllers and DTOs. Served at
 * /api/docs-json and written to docs/openapi.json by `npm run openapi`.
 */
export function buildOpenApiDocument(app: INestApplication): OpenAPIObject {
  return SwaggerModule.createDocument(
    app,
    new DocumentBuilder()
      .setTitle('Resume Screener API')
      .setDescription(
        'Authenticate with a Google session (`Authorization: Bearer <token>`) ' +
          'or an API key (`X-API-Key`). API keys are limited per minute; above the limit the API returns 429.',
      )
      .setVersion('1')
      .addBearerAuth()
      .addApiKey({ type: 'apiKey', in: 'header', name: 'X-API-Key' }, 'api-key')
      .addApiKey(
        { type: 'apiKey', in: 'header', name: 'X-Admin-Token' },
        'admin-token',
      )
      .build(),
  );
}
