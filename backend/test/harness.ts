import type { INestApplication } from '@nestjs/common';
import { Test, type TestingModuleBuilder } from '@nestjs/testing';
import request from 'supertest';
import type { App } from 'supertest/types.js';
import {
  GoogleTokenVerifier,
  type GoogleIdentity,
} from './../src/auth/google-token.verifier.js';
import { configureApp } from './../src/setup.js';
import { FileStorage } from './../src/storage/file-storage.js';
import { InMemoryFileStorage } from './../src/storage/in-memory-file-storage.js';

// Needs a real Postgres: `docker compose up -d` and DATABASE_URL set (see .env.example).
export const hasDatabase = Boolean(process.env.DATABASE_URL);

export interface Harness {
  app: INestApplication<App>;
  storage: InMemoryFileStorage;
  http: () => ReturnType<typeof request>;
  /** Signs in a new user with their own company; returns an access token. */
  signIn: (who: string) => Promise<string>;
}

/**
 * Boots the full API against the real database with Google sign-in faked
 * and files kept in memory.
 * `customize` can override further providers (storage, queue…).
 */
export async function createHarness(
  customize?: (builder: TestingModuleBuilder) => TestingModuleBuilder,
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
  let builder = Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(GoogleTokenVerifier)
    .useValue(fakeGoogle)
    .overrideProvider(FileStorage)
    .useValue(storage);
  if (customize) {
    builder = customize(builder);
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
  return { app, storage, http, signIn };
}

export const bearer = (token: string) => ({ Authorization: `Bearer ${token}` });
