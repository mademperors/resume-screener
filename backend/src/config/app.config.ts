import { IsBoolean, IsInt, IsOptional, IsUrl, Max, Min } from 'class-validator';
import {
  defineConfig,
  ToBoolean,
  ToList,
  type ConfigOf,
} from './define-config.js';

class AppEnv {
  @IsInt()
  @Min(1)
  @Max(65_535)
  PORT: number;

  /** Comma-separated browser origins allowed to call the API. */
  @IsOptional()
  @ToList()
  @IsUrl({ require_tld: false, require_protocol: true }, { each: true })
  CORS_ORIGINS?: string[];

  /** Also process resumes inside the API process (development convenience). */
  @ToBoolean()
  @IsBoolean()
  RUN_WORKER_IN_API: boolean;
}

/** The HTTP process itself. */
export const appConfig = defineConfig('app', AppEnv, (env) => ({
  port: env.PORT,
  corsOrigins: env.CORS_ORIGINS ?? [],
  runWorkerInApi: env.RUN_WORKER_IN_API,
}));

export type AppConfig = ConfigOf<typeof appConfig>;
