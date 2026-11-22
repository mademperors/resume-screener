import { z } from 'zod';
import { defineConfig, envVar, type ConfigOf } from './define-config.js';

/** Object storage for resume files (S3 API; SeaweedFS locally). */
export const storageConfig = defineConfig(
  'storage',
  z.object({
    /** Omit for AWS S3; e.g. http://localhost:8333 for SeaweedFS. */
    S3_ENDPOINT: envVar.url('http', 'https').optional(),
    /**
     * Endpoint browsers use to open download links, when it differs from
     * S3_ENDPOINT (e.g. the API reaches storage by a Docker host name).
     */
    S3_PUBLIC_ENDPOINT: envVar.url('http', 'https').optional(),
    S3_REGION: envVar.text(),
    S3_BUCKET: envVar.text(),
    /** Secret, in .env. */
    S3_ACCESS_KEY_ID: envVar.text(),
    /** Secret, in .env. */
    S3_SECRET_ACCESS_KEY: envVar.text(),
    /** Path-style URLs (endpoint/bucket/key); needed by SeaweedFS. */
    S3_FORCE_PATH_STYLE: envVar.bool(),
    /** Ask the store to encrypt objects (AWS S3). SeaweedFS encrypts volumes instead. */
    S3_SERVER_SIDE_ENCRYPTION: z.enum(['AES256', 'aws:kms']).optional(),
    /** Lifetime of links to original resume files. */
    RESUME_DOWNLOAD_URL_TTL_SECONDS: envVar.int().min(30).max(3600),
  }),
  (env) => ({
    endpoint: env.S3_ENDPOINT,
    publicEndpoint: env.S3_PUBLIC_ENDPOINT,
    region: env.S3_REGION,
    bucket: env.S3_BUCKET,
    accessKeyId: env.S3_ACCESS_KEY_ID,
    secretAccessKey: env.S3_SECRET_ACCESS_KEY,
    forcePathStyle: env.S3_FORCE_PATH_STYLE,
    serverSideEncryption: env.S3_SERVER_SIDE_ENCRYPTION,
    downloadUrlTtlSeconds: env.RESUME_DOWNLOAD_URL_TTL_SECONDS,
  }),
);

export type StorageConfig = ConfigOf<typeof storageConfig>;
