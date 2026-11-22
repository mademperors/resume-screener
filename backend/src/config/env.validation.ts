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
  ValidateIf,
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

  // --- Plans and administration ---

  /** Requests per minute per API key on the standard plan. */
  @IsInt()
  @Min(1)
  PLAN_STANDARD_RATE_LIMIT: number = 200;

  /** Requests per minute per API key on the extended plan. */
  @IsInt()
  @Min(1)
  PLAN_EXTENDED_RATE_LIMIT: number = 1000;

  /**
   * Enables the admin API (/api/v1/admin) for the platform operator, who
   * sends it in the X-Admin-Token header. Unset: the admin API is off.
   */
  @IsOptional()
  @IsString()
  @MinLength(32)
  ADMIN_API_TOKEN?: string;

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

  // --- Processing queue (BullMQ on Valkey/Redis) ---

  /** e.g. redis://localhost:6379; use rediss:// for TLS. */
  @IsUrl({ protocols: ['redis', 'rediss'], require_tld: false })
  REDIS_URL: string;

  /** Tries per resume before it is marked "Processing failed". */
  @IsInt()
  @Min(1)
  @Max(20)
  PROCESSING_MAX_ATTEMPTS: number = 5;

  /** First retry delay; each next one doubles. */
  @IsInt()
  @Min(100)
  PROCESSING_BACKOFF_MS: number = 10_000;

  // --- Workers ---

  /**
   * Which screening model evaluates resumes: `mock` (keyword matching, for
   * development and demos) or `gemini` (Gemini Decision 1; needs GEMINI_API_KEY).
   */
  @IsIn(['mock', 'gemini'])
  SCREENING_MODEL: 'mock' | 'gemini' = 'mock';

  /** Gemini API key (https://aistudio.google.com/api-keys). Required when SCREENING_MODEL=gemini. */
  @ValidateIf((env: EnvironmentVariables) => env.SCREENING_MODEL === 'gemini')
  @IsString()
  @IsNotEmpty()
  GEMINI_API_KEY?: string;

  /** Gemini Decisions API endpoint. */
  @IsUrl({ require_tld: false })
  GEMINI_API_URL: string =
    'https://generativelanguage.googleapis.com/v1beta/decisions';

  /** Decision model; keep an exact id so a new release can't shift the calibrated thresholds. */
  @IsString()
  @IsNotEmpty()
  GEMINI_MODEL: string = 'gemini-decision-1';

  /** Give up on one Gemini request after this long (then it is retried later). */
  @IsInt()
  @Min(1000)
  GEMINI_TIMEOUT_MS: number = 15_000;

  /** Also process resumes inside the API process (development convenience). */
  @IsIn(['true', 'false'])
  RUN_WORKER_IN_API: 'true' | 'false' = 'false';

  /** Resumes processed in parallel by one worker process. */
  @IsInt()
  @Min(1)
  @Max(100)
  WORKER_CONCURRENCY: number = 4;

  /** Resumes sent to the screening model per second, across all workers. */
  @IsInt()
  @Min(1)
  SCREENING_RATE_LIMIT_PER_SECOND: number = 10;

  /** How often stuck and failed resumes are checked. */
  @IsInt()
  @Min(5)
  SWEEP_INTERVAL_SECONDS: number = 60;

  /** Queued or Processing longer than this counts as stuck and is queued again. */
  @IsInt()
  @Min(1)
  STALE_RESUME_MINUTES: number = 15;

  /** Retry resumes that failed for a temporary reason after this long; 0 turns it off. */
  @IsInt()
  @Min(0)
  FAILED_RESUME_RETRY_AFTER_MINUTES: number = 60;

  /** Automatic retries per failed resume. */
  @IsInt()
  @Min(0)
  FAILED_RESUME_MAX_AUTO_RETRIES: number = 3;

  // --- Data retention ---

  /** Candidate data is deleted this many days after its job is closed or deleted. */
  @IsInt()
  @Min(1)
  RETENTION_DAYS: number = 365;

  /**
   * How often retention runs; it also retries deleting stored files, so keep
   * it well under 24 hours.
   */
  @IsInt()
  @Min(1)
  @Max(720)
  RETENTION_INTERVAL_MINUTES: number = 60;
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
