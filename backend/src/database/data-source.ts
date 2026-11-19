import { DataSource } from 'typeorm';
import { databaseOptions } from './database.options.js';

/**
 * Used only by the TypeORM CLI (see the migration:* scripts in package.json),
 * which runs against the compiled output in dist/.
 */
const url = process.env.DATABASE_URL;
if (!url) {
  throw new Error('DATABASE_URL is not set. Copy .env.example to .env.');
}

export default new DataSource(databaseOptions(url, false));
