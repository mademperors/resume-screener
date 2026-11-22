import { z } from 'zod';
import { defineConfig, envVar, type ConfigOf } from './define-config.js';

/** Signing tokens and checking Google sign-ins. */
export const authConfig = defineConfig(
  'auth',
  z.object({
    /** Secret: at least 32 random characters, in .env. */
    JWT_SECRET: z.string().min(32),
    /** OAuth 2.0 Web client ID from Google Cloud Console. */
    GOOGLE_CLIENT_ID: envVar.text(),
  }),
  (env) => ({
    jwtSecret: env.JWT_SECRET,
    googleClientId: env.GOOGLE_CLIENT_ID,
  }),
);

export type AuthConfig = ConfigOf<typeof authConfig>;
