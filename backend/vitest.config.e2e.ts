import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: { tsconfigPaths: true },
  test: {
    globals: true,
    root: './',
    include: ['**/*.e2e-spec.ts'],
    // Files share one database; each boots the app, which applies migrations.
    fileParallelism: false,
    // Each file boots the whole app (and its imports) in beforeAll.
    hookTimeout: 60_000,
    testTimeout: 30_000,
    // ConfigModule validates env when AppModule is imported, so set test values here.
    env: {
      DB_RUN_MIGRATIONS: 'true',
      JWT_SECRET: 'e2e-secret-e2e-secret-e2e-secret-e2e',
      GOOGLE_CLIENT_ID: 'e2e-client-id',
      // The app uses in-memory storage in e2e tests; storage.e2e-spec.ts
      // talks to the real store when S3_ENDPOINT and credentials are set.
      S3_ACCESS_KEY_ID: process.env.S3_ACCESS_KEY_ID ?? 'e2e-access-key',
      S3_SECRET_ACCESS_KEY:
        process.env.S3_SECRET_ACCESS_KEY ?? 'e2e-secret-key',
      // Database 1 keeps test queues apart from development data. Most e2e
      // files record queued tasks; worker.e2e-spec.ts uses the real queue.
      REDIS_URL: process.env.REDIS_URL ?? 'redis://localhost:6379/1',
      PROCESSING_BACKOFF_MS: '200',
    },
  },
});
