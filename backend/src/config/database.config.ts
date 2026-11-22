import {
  IsBoolean,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Max,
  Min,
  ValidateIf,
} from 'class-validator';
import { defineConfig, ToBoolean, type ConfigOf } from './define-config.js';

const usesParts = (env: DatabaseEnv) => !env.DATABASE_URL;

class DatabaseEnv {
  /**
   * A full connection URL, e.g. for a managed database. When unset, the URL
   * is built from the POSTGRES_* variables, which the Postgres container and
   * the backup service read too.
   */
  @IsOptional()
  @IsString()
  DATABASE_URL?: string;

  @ValidateIf(usesParts)
  @IsString()
  @IsNotEmpty()
  POSTGRES_HOST: string;

  @ValidateIf(usesParts)
  @IsInt()
  @Min(1)
  @Max(65_535)
  POSTGRES_PORT: number;

  @ValidateIf(usesParts)
  @IsString()
  @IsNotEmpty()
  POSTGRES_USER: string;

  /** Secret: set it in .env. */
  @ValidateIf(usesParts)
  @IsString()
  @IsNotEmpty()
  POSTGRES_PASSWORD: string;

  @ValidateIf(usesParts)
  @IsString()
  @IsNotEmpty()
  POSTGRES_DB: string;

  /** Apply pending migrations when the API starts. Workers never run them. */
  @ToBoolean()
  @IsBoolean()
  DB_RUN_MIGRATIONS: boolean;
}

export const databaseConfig = defineConfig('database', DatabaseEnv, (env) => ({
  url:
    env.DATABASE_URL ??
    `postgres://${encodeURIComponent(env.POSTGRES_USER)}:${encodeURIComponent(
      env.POSTGRES_PASSWORD,
    )}@${env.POSTGRES_HOST}:${env.POSTGRES_PORT}/${encodeURIComponent(env.POSTGRES_DB)}`,
  runMigrations: env.DB_RUN_MIGRATIONS,
}));

export type DatabaseConfig = ConfigOf<typeof databaseConfig>;
