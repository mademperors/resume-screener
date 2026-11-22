import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module.js';
import { appConfig, type AppConfig } from './config/app.config.js';
import { ResumeWorker } from './processing/resume-worker.service.js';
import { configureApp } from './setup.js';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const config = app.get<AppConfig>(appConfig.KEY);
  configureApp(app, config.corsOrigins);
  app.enableShutdownHooks();
  if (config.runWorkerInApi) {
    await app.get(ResumeWorker).start();
  }
  await app.listen(config.port);
}
await bootstrap();
