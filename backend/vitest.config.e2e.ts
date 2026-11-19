import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: { tsconfigPaths: true },
  test: {
    globals: true,
    root: './',
    include: ['**/*.e2e-spec.ts'],
    // Files share one database; each boots the app, which applies migrations.
    fileParallelism: false,
    // ConfigModule validates env when AppModule is imported, so set test values here.
    env: {
      DB_RUN_MIGRATIONS: 'true',
      JWT_SECRET: 'e2e-secret-e2e-secret-e2e-secret-e2e',
      GOOGLE_CLIENT_ID: 'e2e-client-id',
    },
  },
});
