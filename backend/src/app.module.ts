import { Module } from '@nestjs/common';
import { ApiKeysModule } from './api-keys/api-keys.module.js';
import { AuthModule } from './auth/auth.module.js';
import { CandidatesModule } from './candidates/candidates.module.js';
import { ExportModule } from './export/export.module.js';
import { HealthController } from './health/health.controller.js';
import { infrastructureImports } from './infrastructure.js';
import { JobsModule } from './jobs/jobs.module.js';
import { ProcessingModule } from './processing/processing.module.js';
import { ResumesModule } from './resumes/resumes.module.js';

/** The HTTP API. Background processing runs in WorkerModule (src/worker.ts). */
@Module({
  imports: [
    ...infrastructureImports('api'),
    AuthModule,
    ApiKeysModule,
    JobsModule,
    ResumesModule,
    CandidatesModule,
    ExportModule,
    // Started only when RUN_WORKER_IN_API=true (see main.ts).
    ProcessingModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}
