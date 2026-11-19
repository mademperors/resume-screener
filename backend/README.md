# Resume Screener — backend

NestJS REST API (`/api/v1`, OpenAPI docs at `/api/docs`) plus a background
worker that processes uploaded resumes.

## Run locally

```bash
docker compose up -d          # Postgres, Valkey (queue), SeaweedFS (S3 file storage)
cp .env.example .env          # then set JWT_SECRET and GOOGLE_CLIENT_ID
npm install
npm run start:dev             # API on :3000; applies migrations on start
npm run start:worker:dev      # worker (or set RUN_WORKER_IN_API=true)
```

Start the worker after the API has applied migrations. Run more worker
processes, or raise `WORKER_CONCURRENCY`, to process faster.

## Tests

```bash
npm test                      # unit tests
npm run lint

# e2e: needs the docker compose services and a separate database
docker compose exec postgres psql -U screener -c "CREATE DATABASE screener_e2e"
DATABASE_URL=postgres://screener:screener@localhost:5432/screener_e2e npm run test:e2e
# add S3_ENDPOINT=http://localhost:8333 S3_ACCESS_KEY_ID=screener
# S3_SECRET_ACCESS_KEY=screener-dev-secret to also test real file storage
```

## Database migrations

The schema is managed by TypeORM migrations in `src/database/migrations`
(`synchronize` is off). After changing an entity:

```bash
npm run migration:generate -- src/database/migrations/DescribeTheChange
# then add the new class to src/database/migrations/index.ts
```

## How a resume is processed

1. `POST /jobs/:jobId/resumes` checks each file, stores it in object storage,
   saves it as `Queued` and adds a task to the BullMQ queue.
2. A worker (`src/processing`) takes the task and runs the pipeline:
   **TextExtractor → ResumePreprocessor → ScreeningModel → ScoringEngine**,
   then saves the candidate and an evaluation tied to the job's scoring config
   version and the model version.
3. Temporary failures are retried with backoff, then marked
   `Processing failed`. A periodic sweep queues stuck resumes again and
   retries temporary failures a few times. Recruiters can retry by hand.

Each stage is an abstract class in `src/processing/stages.ts`, registered in
`src/processing/processing.module.ts`. The stages are placeholders for now, so
resumes end as `Processing failed` with a "not fully set up yet" message.

### Connecting Jev

Implement `JevScreeningModel` in
`src/processing/screening/jev-screening-model.ts`; its comment lists the
contract (one verdict per requirement with a confidence in 0..1, which errors
to throw, env variables for secrets). Nothing else needs to change.
`test/fake-stages.ts` shows a minimal working model.
