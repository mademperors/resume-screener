import { z } from 'zod';
import { defineConfig, type ConfigOf } from './define-config.js';

export const adminConfig = defineConfig(
  'admin',
  z.object({
    /**
     * Secret that turns on the operator admin API (/api/v1/admin, header
     * X-Admin-Token). Unset: the admin API is off.
     */
    ADMIN_API_TOKEN: z.string().min(32).optional(),
  }),
  (env) => ({ token: env.ADMIN_API_TOKEN ?? null }),
);

export type AdminConfig = ConfigOf<typeof adminConfig>;
