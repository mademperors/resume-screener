import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ApiKeysModule } from './api-keys/api-keys.module.js';
import { AuthModule } from './auth/auth.module.js';
import { CandidatesModule } from './candidates/candidates.module.js';
import {
  validateEnv,
  type EnvironmentVariables,
} from './config/env.validation.js';
import { databaseOptions } from './database/database.options.js';
import { HealthController } from './health/health.controller.js';
import { JobsModule } from './jobs/jobs.module.js';
import { ResumesModule } from './resumes/resumes.module.js';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, validate: validateEnv }),
    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService<EnvironmentVariables, true>) =>
        databaseOptions(
          config.get('DATABASE_URL', { infer: true }),
          config.get('DB_RUN_MIGRATIONS', { infer: true }) === 'true',
        ),
    }),
    AuthModule,
    ApiKeysModule,
    JobsModule,
    ResumesModule,
    CandidatesModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}
