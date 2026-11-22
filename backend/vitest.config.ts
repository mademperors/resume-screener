import { defineConfig } from 'vitest/config';
import { integrationEnv } from './test/support/test-env.js';

/**
 * Two projects:
 * - unit: pure logic, no I/O; `npm test`.
 * - integration: the app against real Postgres, Valkey and SeaweedFS, with
 *   fakes only at the edges (Google sign-in, the screening model);
 *   `npm run test:integration`.
 */
export default defineConfig({
  // Resolves the @src/* alias declared in tsconfig.json.
  resolve: { tsconfigPaths: true },
  test: {
    globals: true,
    restoreMocks: true,
    unstubEnvs: true,
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      exclude: [
        'src/main.ts',
        'src/worker.ts',
        'src/database/migrations/**',
        'src/**/*.module.ts',
        'src/**/dto/**',
      ],
      reporter: ['text-summary', 'html'],
    },
    projects: [
      {
        extends: true,
        test: {
          name: 'unit',
          include: ['test/unit/**/*.spec.ts'],
        },
      },
      {
        extends: true,
        test: {
          name: 'integration',
          include: ['test/integration/**/*.spec.ts'],
          globalSetup: ['test/support/global-setup.ts'],
          // Files share one database and reset it when they start.
          fileParallelism: false,
          // Each file boots the whole app in beforeAll.
          hookTimeout: 60_000,
          testTimeout: 30_000,
          env: integrationEnv,
        },
      },
    ],
  },
});
