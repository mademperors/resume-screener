import { z } from 'zod';
import { defineConfig, envVar, type ConfigOf } from './define-config.js';

const POSTGRES_PARTS = [
  'POSTGRES_HOST',
  'POSTGRES_PORT',
  'POSTGRES_USER',
  'POSTGRES_PASSWORD',
  'POSTGRES_DB',
] as const;

export const databaseConfig = defineConfig(
  'database',
  z
    .object({
      /**
       * A full connection URL, e.g. for a managed database. When unset, the
       * URL is built from the POSTGRES_* variables, which the Postgres
       * container and the backup service read too.
       */
      DATABASE_URL: envVar.text().optional(),
      POSTGRES_HOST: envVar.text().optional(),
      POSTGRES_PORT: envVar.int().min(1).max(65_535).optional(),
      POSTGRES_USER: envVar.text().optional(),
      /** Secret: set it in .env. */
      POSTGRES_PASSWORD: envVar.text().optional(),
      POSTGRES_DB: envVar.text().optional(),
      /** Apply pending migrations when the API starts. Workers never run them. */
      DB_RUN_MIGRATIONS: envVar.bool(),
    })
    .superRefine((env, ctx) => {
      if (env.DATABASE_URL) {
        return;
      }
      for (const name of POSTGRES_PARTS) {
        if (env[name] === undefined) {
          ctx.addIssue({
            code: 'custom',
            path: [name],
            message: `${name} is required unless DATABASE_URL is set`,
          });
        }
      }
    }),
  (env) => ({
    url:
      env.DATABASE_URL ??
      `postgres://${encodeURIComponent(env.POSTGRES_USER!)}:${encodeURIComponent(
        env.POSTGRES_PASSWORD!,
      )}@${env.POSTGRES_HOST}:${env.POSTGRES_PORT}/${encodeURIComponent(env.POSTGRES_DB!)}`,
    runMigrations: env.DB_RUN_MIGRATIONS,
  }),
);

export type DatabaseConfig = ConfigOf<typeof databaseConfig>;
