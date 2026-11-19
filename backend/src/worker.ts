import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { ResumeWorker } from './processing/resume-worker.service.js';
import { WorkerModule } from './worker.module.js';

/**
 * Background worker entry point: `npm run start:worker`. Run as many as
 * needed; they share the queue. Stops gracefully on SIGTERM/SIGINT.
 */
async function bootstrap() {
  const app = await NestFactory.createApplicationContext(WorkerModule);
  app.enableShutdownHooks();
  await app.get(ResumeWorker).start();
  new Logger('Worker').log('Worker started');
}
await bootstrap();
