import { TypeOrmModule } from '@nestjs/typeorm';
import { AppConfigModule } from './config/config.module.js';
import {
  databaseConfig,
  type DatabaseConfig,
} from './config/database.config.js';
import { databaseOptions } from './database/database.options.js';
import { QueueModule } from './queue/queue.module.js';
import { StorageModule } from './storage/storage.module.js';

/**
 * Config, database, storage and queue, shared by the API and the worker.
 * Only the API applies migrations, so two processes never race on them.
 */
export function infrastructureImports(role: 'api' | 'worker') {
  return [
    AppConfigModule,
    TypeOrmModule.forRootAsync({
      inject: [databaseConfig.KEY],
      useFactory: (config: DatabaseConfig) =>
        databaseOptions(config.url, role === 'api' && config.runMigrations),
    }),
    StorageModule,
    QueueModule,
  ];
}
