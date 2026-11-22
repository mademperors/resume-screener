import type { INestApplication } from '@nestjs/common';
import { Test, type TestingModuleBuilder } from '@nestjs/testing';
import request from 'supertest';
import type { App } from 'supertest/types.js';
import { DataSource } from 'typeorm';
import {
  IdentityVerifier,
  type VerifiedIdentity,
} from '@src/auth/identity-verifier.js';
import {
  ProcessingQueue,
  type ResumeTask,
} from '@src/queue/processing-queue.js';
import { configureApp } from '@src/setup.js';
import { FileNotFoundError, FileStorage } from '@src/storage/file-storage.js';

export interface Harness {
  app: INestApplication<App>;
  db: DataSource;
  /** The real object storage (SeaweedFS). */
  storage: FileStorage;
  /** Records tasks unless the harness uses the real queue. */
  queue: RecordingProcessingQueue;
  http: () => ReturnType<typeof request>;
  /** Signs in a new user with their own company; returns an access token. */
  signIn: (who: string) => Promise<string>;
  fileExists: (key: string) => Promise<boolean>;
  close: () => Promise<void>;
}

export interface HarnessOptions {
  /** Use the real BullMQ queue instead of recording tasks. */
  realQueue?: boolean;
  /** Override further providers, e.g. the pipeline stages. */
  customize?: (builder: TestingModuleBuilder) => TestingModuleBuilder;
}

/**
 * Boots the whole API against the test database, Valkey and SeaweedFS. Only
 * the edges are faked: Google sign-in always succeeds, and by default queued
 * tasks are recorded so a test decides when (and with which stages) they run.
 *
 * Every harness starts from empty tables, so test files can't see each
 * other's data. Files run one at a time (see vitest.config.ts).
 */
export async function createHarness(
  options: HarnessOptions = {},
): Promise<Harness> {
  // Imported lazily so loading this file doesn't validate the environment.
  const { AppModule } = await import('@src/app.module.js');
  const fakeGoogle = {
    verify: async (idToken: string): Promise<VerifiedIdentity> => ({
      subject: `google-${idToken}`,
      email: `${idToken}@example.com`,
      name: idToken,
      avatarUrl: null,
      hostedDomain: null,
    }),
  };
  const queue = new RecordingProcessingQueue();
  let builder = Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(IdentityVerifier)
    .useValue(fakeGoogle);
  if (!options.realQueue) {
    builder = builder.overrideProvider(ProcessingQueue).useValue(queue);
  }
  if (options.customize) {
    builder = options.customize(builder);
  }
  const moduleRef = await builder.compile();
  const app = moduleRef.createNestApplication<INestApplication<App>>();
  configureApp(app);
  await app.init();

  const db = app.get(DataSource);
  await resetDatabase(db);
  const storage = app.get(FileStorage);

  const http = () => request(app.getHttpServer());
  const signIn = async (who: string) => {
    const response = await http()
      .post('/api/v1/auth/google')
      .send({ idToken: who })
      .expect(200);
    return response.body.accessToken as string;
  };
  const fileExists = async (key: string) => {
    try {
      await storage.get(key);
      return true;
    } catch (error) {
      if (error instanceof FileNotFoundError) {
        return false;
      }
      throw error;
    }
  };
  return {
    app,
    db,
    storage,
    queue,
    http,
    signIn,
    fileExists,
    close: () => app.close(),
  };
}

/** Empties every table the app owns; the schema and migrations stay. */
export async function resetDatabase(db: DataSource): Promise<void> {
  const tables = db.entityMetadatas
    .map((meta) => `"${meta.tableName}"`)
    .join(', ');
  await db.query(`TRUNCATE ${tables} RESTART IDENTITY CASCADE`);
}

/** Records tasks instead of sending them to the workers. */
export class RecordingProcessingQueue extends ProcessingQueue {
  readonly tasks: ResumeTask[] = [];
  failNext = false;

  async enqueue(tasks: readonly ResumeTask[]): Promise<void> {
    if (this.failNext) {
      this.failNext = false;
      throw new Error('Queue is down');
    }
    this.tasks.push(...tasks);
  }
}

export const bearer = (token: string) => ({ Authorization: `Bearer ${token}` });
