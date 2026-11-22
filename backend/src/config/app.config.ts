import { z } from 'zod';
import { defineConfig, envVar, type ConfigOf } from './define-config.js';

/** The HTTP process itself. */
export const appConfig = defineConfig(
  'app',
  z.object({
    PORT: envVar.int().min(1).max(65_535),
    /** Comma-separated browser origins allowed to call the API. */
    CORS_ORIGINS: envVar
      .list()
      .pipe(z.array(envVar.url('http', 'https')))
      .default([]),
    /** Also process resumes inside the API process (development convenience). */
    RUN_WORKER_IN_API: envVar.bool(),
  }),
  (env) => ({
    port: env.PORT,
    corsOrigins: env.CORS_ORIGINS,
    runWorkerInApi: env.RUN_WORKER_IN_API,
  }),
);

export type AppConfig = ConfigOf<typeof appConfig>;
