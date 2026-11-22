import { IsNotEmpty, IsString, MinLength } from 'class-validator';
import { defineConfig, type ConfigOf } from './define-config.js';

class AuthEnv {
  /** Secret: at least 32 random characters, in .env. */
  @IsString()
  @MinLength(32)
  JWT_SECRET: string;

  /** OAuth 2.0 Web client ID from Google Cloud Console. */
  @IsString()
  @IsNotEmpty()
  GOOGLE_CLIENT_ID: string;
}

/** Signing tokens and checking Google sign-ins. Only the API needs it. */
export const authConfig = defineConfig('auth', AuthEnv, (env) => ({
  jwtSecret: env.JWT_SECRET,
  googleClientId: env.GOOGLE_CLIENT_ID,
}));

export type AuthConfig = ConfigOf<typeof authConfig>;
