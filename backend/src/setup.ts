import {
  INestApplication,
  ValidationPipe,
  VersioningType,
} from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import {
  AllExceptionsFilter,
  validationExceptionFactory,
} from './common/http-exception.filter.js';

/** Shared by main.ts and e2e tests so both run the same HTTP setup. */
export function configureApp(
  app: INestApplication,
  corsOrigins?: string,
): void {
  app.setGlobalPrefix('api');
  app.enableVersioning({ type: VersioningType.URI, defaultVersion: '1' });
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      exceptionFactory: validationExceptionFactory,
    }),
  );
  app.useGlobalFilters(new AllExceptionsFilter());
  if (corsOrigins) {
    app.enableCors({
      origin: corsOrigins.split(',').map((origin) => origin.trim()),
    });
  }

  const document = SwaggerModule.createDocument(
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
  SwaggerModule.setup('api/docs', app, document);
}
