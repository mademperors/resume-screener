import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import {
  validateEnv,
  type EnvironmentVariables,
} from './config/env.validation.js';
import { databaseOptions } from './database/database.options.js';
import { QueueModule } from './queue/queue.module.js';
import { StorageModule } from './storage/storage.module.js';

/**
 * Config, database, storage and queue, shared by the API and the worker.
 * Only the API applies migrations, so two processes never race on them.
 */
export function infrastructureImports(role: 'api' | 'worker') {
  return [
    ConfigModule.forRoot({ isGlobal: true, validate: validateEnv }),
    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService<EnvironmentVariables, true>) =>
        databaseOptions(
          config.get('DATABASE_URL', { infer: true }),
          role === 'api' &&
            config.get('DB_RUN_MIGRATIONS', { infer: true }) === 'true',
        ),
    }),
    StorageModule,
    QueueModule,
  ];
}
