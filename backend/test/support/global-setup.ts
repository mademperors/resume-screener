import { Redis } from 'ioredis';
import { DataSource } from 'typeorm';
import { databaseOptions } from '../../src/database/database.options.js';
import { testInfrastructure } from './test-env.js';

const START_SERVICES =
  'Start them with `docker compose up -d postgres valkey seaweedfs` in backend/, ' +
  'or point TEST_DATABASE_URL, TEST_REDIS_URL and TEST_S3_ENDPOINT at your own.';

/**
 * Runs once before the integration tests: checks that Postgres, Valkey and
 * SeaweedFS answer, recreates the test database schema from the migrations
 * and clears the test Redis database. Fails loudly instead of skipping tests.
 */
export default async function setup(): Promise<void> {
  const { databaseUrl, redisUrl, s3Endpoint } = testInfrastructure;
  const databaseName = new URL(databaseUrl).pathname.slice(1);
  if (!/test/i.test(databaseName)) {
    throw new Error(
      `Refusing to wipe "${databaseName}": the test database name must contain "test".`,
    );
  }

  await createDatabaseIfMissing(databaseUrl, databaseName);
  await recreateSchema(databaseUrl);
  await flushRedis(redisUrl);
  await assertReachable(s3Endpoint, 'SeaweedFS');
}

async function createDatabaseIfMissing(url: string, name: string) {
  const admin = new URL(url);
  admin.pathname = '/postgres';
  let db: DataSource;
  try {
    db = await new DataSource({
      type: 'postgres',
      url: admin.toString(),
    }).initialize();
  } catch (error) {
    throw new Error(
      `Postgres is not reachable at ${admin.host} (${String(error)}). ${START_SERVICES}`,
    );
  }
  try {
    const rows: unknown[] = await db.query(
      'SELECT 1 FROM pg_database WHERE datname = $1',
      [name],
    );
    if (rows.length === 0) {
      await db.query(`CREATE DATABASE "${name}"`);
    }
  } finally {
    await db.destroy();
  }
}

/** A fresh schema each run also checks that the migrations apply from scratch. */
async function recreateSchema(url: string) {
  const wipe = await new DataSource(databaseOptions(url, false)).initialize();
  await wipe.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public;');
  await wipe.destroy();
  // Connecting again reinstalls the extensions the entities need (uuid-ossp).
  const db = await new DataSource(databaseOptions(url, false)).initialize();
  try {
    await db.runMigrations({ transaction: 'each' });
  } finally {
    await db.destroy();
  }
}

async function flushRedis(url: string) {
  const redis = new Redis(url, {
    lazyConnect: true,
    maxRetriesPerRequest: 1,
    retryStrategy: () => null,
  });
  try {
    await redis.connect();
    await redis.flushdb();
  } catch (error) {
    throw new Error(
      `Valkey is not reachable at ${url} (${String(error)}). ${START_SERVICES}`,
    );
  } finally {
    redis.disconnect();
  }
}

async function assertReachable(url: string, name: string) {
  try {
    await fetch(url, { signal: AbortSignal.timeout(5000) });
  } catch (error) {
    throw new Error(
      `${name} is not reachable at ${url} (${String(error)}). ${START_SERVICES}`,
    );
  }
}
