import { Module } from '@nestjs/common';
import { infrastructureImports } from './infrastructure.js';
import { ProcessingModule } from './processing/processing.module.js';

/** The background worker process: no HTTP server, no migrations. */
@Module({
  imports: [...infrastructureImports('worker'), ProcessingModule],
})
export class WorkerModule {}
