import type { DataSourceOptions } from 'typeorm';
import { ENTITIES } from './entities.js';
import { MIGRATIONS } from './migrations/index.js';

/**
 * Shared by the API, the worker and the migration CLI. The schema is managed
 * only by migrations; `synchronize` stays off everywhere.
 */
export function databaseOptions(
  url: string,
  runMigrations: boolean,
): DataSourceOptions {
  return {
    type: 'postgres',
    url,
    entities: ENTITIES,
    migrations: MIGRATIONS,
    migrationsRun: runMigrations,
    migrationsTransactionMode: 'each',
    synchronize: false,
  };
}
