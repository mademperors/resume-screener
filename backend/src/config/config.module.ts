import { ConfigModule } from '@nestjs/config';
import { adminConfig } from './admin.config.js';
import { appConfig } from './app.config.js';
import { authConfig } from './auth.config.js';
import { databaseConfig } from './database.config.js';
import { envFiles } from './env-files.js';
import { plansConfig } from './plans.config.js';
import { processingConfig } from './processing.config.js';
import { queueConfig } from './queue.config.js';
import { retentionConfig } from './retention.config.js';
import { screeningConfig } from './screening.config.js';
import { sessionConfig } from './session.config.js';
import { storageConfig } from './storage.config.js';

/** Every config namespace. A new `*.config.ts` goes here. */
export const ALL_CONFIGS = [
  appConfig,
  databaseConfig,
  authConfig,
  sessionConfig,
  plansConfig,
  adminConfig,
  storageConfig,
  queueConfig,
  processingConfig,
  screeningConfig,
  retentionConfig,
];

/**
 * All settings, loaded once and global for the API and the worker alike.
 * Every namespace is validated at startup, so a bad or missing setting
 * stops the process before it does anything. Any provider injects the
 * namespace it needs, e.g. `@Inject(storageConfig.KEY) config: StorageConfig`.
 */
export const AppConfigModule = ConfigModule.forRoot({
  isGlobal: true,
  envFilePath: envFiles(),
  load: ALL_CONFIGS,
});
