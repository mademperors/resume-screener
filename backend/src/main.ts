import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module.js';
import type { EnvironmentVariables } from './config/env.validation.js';
import { ResumeWorker } from './processing/resume-worker.service.js';
import { configureApp } from './setup.js';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const config =
    app.get<ConfigService<EnvironmentVariables, true>>(ConfigService);
  configureApp(app, config.get('CORS_ORIGINS', { infer: true }));
  app.enableShutdownHooks();
  if (config.get('RUN_WORKER_IN_API', { infer: true }) === 'true') {
    await app.get(ResumeWorker).start();
  }
  await app.listen(config.get('PORT', { infer: true }));
}
await bootstrap();
