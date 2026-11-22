/**
 * Settings for the integration tests. The defaults match the services in
 * docker-compose.yml (`docker compose up -d postgres valkey seaweedfs`); CI
 * and other setups override them with the TEST_* variables.
 *
 * Separate names (TEST_DATABASE_URL, not DATABASE_URL) so a shell that has
 * the development settings exported can never point the tests, which wipe
 * the database, at development data.
 */
export const testInfrastructure = {
  databaseUrl:
    process.env.TEST_DATABASE_URL ??
    'postgres://screener:screener@localhost:5432/screener_test',
  // Database 1 keeps test queues and counters apart from development data.
  redisUrl: process.env.TEST_REDIS_URL ?? 'redis://localhost:6379/1',
  s3Endpoint: process.env.TEST_S3_ENDPOINT ?? 'http://localhost:8333',
  s3AccessKeyId: process.env.TEST_S3_ACCESS_KEY_ID ?? 'screener',
  s3SecretAccessKey:
    process.env.TEST_S3_SECRET_ACCESS_KEY ?? 'screener-dev-secret',
};

/** What the app reads from the environment during integration tests. */
export const integrationEnv: Record<string, string> = {
  DATABASE_URL: testInfrastructure.databaseUrl,
  // The global setup applies migrations once for the whole run.
  DB_RUN_MIGRATIONS: 'false',
  REDIS_URL: testInfrastructure.redisUrl,
  S3_ENDPOINT: testInfrastructure.s3Endpoint,
  S3_ACCESS_KEY_ID: testInfrastructure.s3AccessKeyId,
  S3_SECRET_ACCESS_KEY: testInfrastructure.s3SecretAccessKey,
  S3_BUCKET: 'resumes-test',
  JWT_SECRET: 'test-secret-test-secret-test-secret-test',
  GOOGLE_CLIENT_ID: 'test-client-id',
  ADMIN_API_TOKEN: 'test-admin-token-test-admin-token-test',
  PROCESSING_BACKOFF_MS: '200',
};
