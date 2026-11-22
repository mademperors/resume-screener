import { IsOptional, IsString, MinLength } from 'class-validator';
import { defineConfig, type ConfigOf } from './define-config.js';

class AdminEnv {
  /**
   * Secret that turns on the operator admin API (/api/v1/admin, header
   * X-Admin-Token). Unset: the admin API is off.
   */
  @IsOptional()
  @IsString()
  @MinLength(32)
  ADMIN_API_TOKEN?: string;
}

export const adminConfig = defineConfig('admin', AdminEnv, (env) => ({
  token: env.ADMIN_API_TOKEN ?? null,
}));

export type AdminConfig = ConfigOf<typeof adminConfig>;
