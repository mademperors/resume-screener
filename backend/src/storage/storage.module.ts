import { Global, Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { storageConfig, type StorageConfig } from '../config/storage.config.js';
import { FileStorage } from './file-storage.js';
import { S3FileStorage } from './s3-file-storage.js';

@Global()
@Module({
  imports: [ConfigModule.forFeature(storageConfig)],
  providers: [
    {
      provide: FileStorage,
      inject: [storageConfig.KEY],
      useFactory: (config: StorageConfig) => new S3FileStorage(config),
    },
  ],
  exports: [FileStorage],
})
export class StorageModule {}
