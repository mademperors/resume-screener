import {
  IsBoolean,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUrl,
  Max,
  Min,
} from 'class-validator';
import { defineConfig, ToBoolean, type ConfigOf } from './define-config.js';

const HTTP_URL = { require_tld: false, protocols: ['http', 'https'] };

class StorageEnv {
  /** Omit for AWS S3; e.g. http://localhost:8333 for SeaweedFS. */
  @IsOptional()
  @IsUrl(HTTP_URL)
  S3_ENDPOINT?: string;

  /**
   * Endpoint browsers use to open download links, when it differs from
   * S3_ENDPOINT (e.g. the API reaches storage by a Docker host name).
   */
  @IsOptional()
  @IsUrl(HTTP_URL)
  S3_PUBLIC_ENDPOINT?: string;

  @IsString()
  @IsNotEmpty()
  S3_REGION: string;

  @IsString()
  @IsNotEmpty()
  S3_BUCKET: string;

  /** Secret, in .env. */
  @IsString()
  @IsNotEmpty()
  S3_ACCESS_KEY_ID: string;

  /** Secret, in .env. */
  @IsString()
  @IsNotEmpty()
  S3_SECRET_ACCESS_KEY: string;

  /** Path-style URLs (endpoint/bucket/key); needed by SeaweedFS. */
  @ToBoolean()
  @IsBoolean()
  S3_FORCE_PATH_STYLE: boolean;

  /** Ask the store to encrypt objects (AWS S3). SeaweedFS encrypts volumes instead. */
  @IsOptional()
  @IsIn(['AES256', 'aws:kms'])
  S3_SERVER_SIDE_ENCRYPTION?: 'AES256' | 'aws:kms';

  /** Lifetime of links to original resume files. */
  @IsInt()
  @Min(30)
  @Max(3600)
  RESUME_DOWNLOAD_URL_TTL_SECONDS: number;
}

/** Object storage for resume files (S3 API; SeaweedFS locally). */
export const storageConfig = defineConfig('storage', StorageEnv, (env) => ({
  endpoint: env.S3_ENDPOINT,
  publicEndpoint: env.S3_PUBLIC_ENDPOINT,
  region: env.S3_REGION,
  bucket: env.S3_BUCKET,
  accessKeyId: env.S3_ACCESS_KEY_ID,
  secretAccessKey: env.S3_SECRET_ACCESS_KEY,
  forcePathStyle: env.S3_FORCE_PATH_STYLE,
  serverSideEncryption: env.S3_SERVER_SIDE_ENCRYPTION,
  downloadUrlTtlSeconds: env.RESUME_DOWNLOAD_URL_TTL_SECONDS,
}));

export type StorageConfig = ConfigOf<typeof storageConfig>;
