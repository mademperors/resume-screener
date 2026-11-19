import { Global, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { EnvironmentVariables } from '../config/env.validation.js';
import { FileStorage } from './file-storage.js';
import { S3FileStorage } from './s3-file-storage.js';

@Global()
@Module({
  providers: [
    {
      provide: FileStorage,
      inject: [ConfigService],
      useFactory: (config: ConfigService<EnvironmentVariables, true>) =>
        new S3FileStorage({
          endpoint: config.get('S3_ENDPOINT', { infer: true }),
          publicEndpoint: config.get('S3_PUBLIC_ENDPOINT', { infer: true }),
          region: config.get('S3_REGION', { infer: true }),
          bucket: config.get('S3_BUCKET', { infer: true }),
          accessKeyId: config.get('S3_ACCESS_KEY_ID', { infer: true }),
          secretAccessKey: config.get('S3_SECRET_ACCESS_KEY', { infer: true }),
          forcePathStyle:
            config.get('S3_FORCE_PATH_STYLE', { infer: true }) === 'true',
          serverSideEncryption: config.get('S3_SERVER_SIDE_ENCRYPTION', {
            infer: true,
          }),
        }),
    },
  ],
  exports: [FileStorage],
})
export class StorageModule {}
