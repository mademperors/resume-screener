import { plainToInstance } from 'class-transformer';
import {
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUrl,
  Max,
  Min,
  MinLength,
  validateSync,
} from 'class-validator';

export class EnvironmentVariables {
  @IsOptional()
  @IsInt()
  @Min(1)
  PORT: number = 3000;

  @IsString()
  @IsNotEmpty()
  DATABASE_URL: string;

  /** Apply pending migrations when the API starts. Workers never run them. */
  @IsIn(['true', 'false'])
  DB_RUN_MIGRATIONS: 'true' | 'false' = 'true';

  @IsString()
  @MinLength(32)
  JWT_SECRET: string;

  @IsString()
  @IsNotEmpty()
  GOOGLE_CLIENT_ID: string;

  @IsInt()
  @Min(1)
  ACCESS_TOKEN_TTL_MINUTES: number = 15;

  @IsInt()
  @Min(1)
  SESSION_IDLE_TIMEOUT_MINUTES: number = 30;

  @IsInt()
  @Min(1)
  SESSION_MAX_AGE_HOURS: number = 168;

  /** Comma-separated list of origins allowed to call the API from a browser. */
  @IsOptional()
  @IsString()
  CORS_ORIGINS?: string;

  // --- Object storage (S3 API; SeaweedFS locally) ---

  /** Omit for AWS S3; e.g. http://localhost:8333 for SeaweedFS. */
  @IsOptional()
  @IsUrl({ require_tld: false })
  S3_ENDPOINT?: string;

  /**
   * Endpoint browsers use to open download links, when it differs from
   * S3_ENDPOINT (e.g. the API reaches storage by a Docker host name).
   */
  @IsOptional()
  @IsUrl({ require_tld: false })
  S3_PUBLIC_ENDPOINT?: string;

  @IsString()
  @IsNotEmpty()
  S3_REGION: string = 'us-east-1';

  @IsString()
  @IsNotEmpty()
  S3_BUCKET: string = 'resumes';

  @IsString()
  @IsNotEmpty()
  S3_ACCESS_KEY_ID: string;

  @IsString()
  @IsNotEmpty()
  S3_SECRET_ACCESS_KEY: string;

  /** Path-style URLs (endpoint/bucket/key); needed by SeaweedFS. */
  @IsIn(['true', 'false'])
  S3_FORCE_PATH_STYLE: 'true' | 'false' = 'true';

  /** Ask the store to encrypt objects (AWS S3). SeaweedFS encrypts volumes instead. */
  @IsOptional()
  @IsIn(['AES256', 'aws:kms'])
  S3_SERVER_SIDE_ENCRYPTION?: 'AES256' | 'aws:kms';

  /** Lifetime of links to original resume files. */
  @IsInt()
  @Min(30)
  @Max(3600)
  RESUME_DOWNLOAD_URL_TTL_SECONDS: number = 300;
}

export function validateEnv(
  config: Record<string, unknown>,
): EnvironmentVariables {
  // `NAME=` in .env means "not set", so optional values may be left empty.
  const provided = Object.fromEntries(
    Object.entries(config).filter(([, value]) => value !== ''),
  );
  const env = plainToInstance(EnvironmentVariables, provided, {
    enableImplicitConversion: true,
  });
  const errors = validateSync(env, { skipMissingProperties: false });
  if (errors.length > 0) {
    const details = errors
      .map((error) => Object.values(error.constraints ?? {}).join(', '))
      .join('; ');
    throw new Error(`Invalid environment configuration: ${details}`);
  }
  return env;
}
