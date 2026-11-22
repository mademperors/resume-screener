import 'reflect-metadata';
import { DataSource } from 'typeorm';
import { databaseConfig } from '../config/database.config.js';
import { databaseOptions } from './database.options.js';

/**
 * Used only by the TypeORM CLI (see the migration:* scripts in package.json),
 * which runs against the compiled output in dist/ and loads .env.defaults
 * and .env itself.
 */
export default new DataSource(
  databaseOptions(databaseConfig.load().url, false),
);
