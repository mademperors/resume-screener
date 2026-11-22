import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import {
  databaseConfig,
  type DatabaseConfig,
} from './config/database.config.js';
import { envFiles } from './config/env-files.js';
import { databaseOptions } from './database/database.options.js';
import { QueueModule } from './queue/queue.module.js';
import { StorageModule } from './storage/storage.module.js';

/**
 * Config, database, storage and queue, shared by the API and the worker.
 * Only the API applies migrations, so two processes never race on them.
 *
 * Settings are split into namespaces (src/config/*.config.ts); each module
 * registers the ones it needs with ConfigModule.forFeature, so a process
 * validates only what it uses.
 */
export function infrastructureImports(role: 'api' | 'worker') {
  return [
    ConfigModule.forRoot({ isGlobal: true, envFilePath: envFiles() }),
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule.forFeature(databaseConfig)],
      inject: [databaseConfig.KEY],
      useFactory: (config: DatabaseConfig) =>
        databaseOptions(config.url, role === 'api' && config.runMigrations),
    }),
    StorageModule,
    QueueModule,
  ];
}
