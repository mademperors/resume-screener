import type { INestApplication } from '@nestjs/common';
import { Test, type TestingModuleBuilder } from '@nestjs/testing';
import request from 'supertest';
import type { App } from 'supertest/types.js';
import {
  GoogleTokenVerifier,
  type GoogleIdentity,
} from './../src/auth/google-token.verifier.js';
import {
  ProcessingQueue,
  type ResumeTask,
} from './../src/queue/processing-queue.js';
import { configureApp } from './../src/setup.js';
import { FileStorage } from './../src/storage/file-storage.js';
import { InMemoryFileStorage } from './../src/storage/in-memory-file-storage.js';

// Needs a real Postgres: `docker compose up -d` and DATABASE_URL set (see .env.example).
export const hasDatabase = Boolean(process.env.DATABASE_URL);

export interface Harness {
  app: INestApplication<App>;
  storage: InMemoryFileStorage;
  /** Records tasks unless the harness uses the real queue. */
  queue: RecordingProcessingQueue;
  http: () => ReturnType<typeof request>;
  /** Signs in a new user with their own company; returns an access token. */
  signIn: (who: string) => Promise<string>;
}

export interface HarnessOptions {
  /** Use the real BullMQ queue (needs Valkey/Redis) instead of recording tasks. */
  realQueue?: boolean;
  /** Override further providers, e.g. the pipeline stages. */
  customize?: (builder: TestingModuleBuilder) => TestingModuleBuilder;
}

/**
 * Boots the full API against the real database with Google sign-in faked,
 * files kept in memory and, by default, queued tasks recorded instead of
 * processed.
 */
export async function createHarness(
  options: HarnessOptions = {},
): Promise<Harness> {
  // Imported lazily: loading AppModule validates env, which fails without a database.
  const { AppModule } = await import('./../src/app.module.js');
  const run = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const fakeGoogle = {
    verify: async (idToken: string): Promise<GoogleIdentity> => ({
      subject: `${run}-${idToken}`,
      email: `${idToken}-${run}@example.com`,
      name: idToken,
      avatarUrl: null,
      hostedDomain: null,
    }),
  };
  const storage = new InMemoryFileStorage();
  const queue = new RecordingProcessingQueue();
  let builder = Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(GoogleTokenVerifier)
    .useValue(fakeGoogle)
    .overrideProvider(FileStorage)
    .useValue(storage);
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

  const http = () => request(app.getHttpServer());
  const signIn = async (who: string) => {
    const response = await http()
      .post('/api/v1/auth/google')
      .send({ idToken: who })
      .expect(200);
    return response.body.accessToken as string;
  };
  return { app, storage, queue, http, signIn };
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
