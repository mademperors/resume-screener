# Resume Screener — backend

NestJS REST API (`/api/v1`, OpenAPI docs at `/api/docs`) plus a background
worker that processes uploaded resumes.

## Run everything in Docker

```bash
cp .env.example .env          # set JWT_SECRET and GOOGLE_CLIENT_ID
docker compose up -d --build
```

The API is at `https://localhost/api/v1`, docs at `https://localhost/api/docs`
(Caddy's local certificate; trust it or use `curl -k`). Containers, all in the
`resume-screener-backend` compose project:

| Container | Role |
|---|---|
| `resume-screener-postgres` | PostgreSQL |
| `resume-screener-valkey` | Queue (BullMQ) and shared rate-limit counters |
| `resume-screener-seaweedfs` | Resume files (S3 API, encrypted volumes) |
| `resume-screener-migrate` | Applies migrations, then exits; API and worker wait for it |
| `resume-screener-api` | REST API |
| `resume-screener-worker` | Resume processing, sweeps, data retention |
| `resume-screener-caddy` | HTTPS for the API (`API_DOMAIN`) and download links (`FILES_DOMAIN`); HTTP redirects to HTTPS |
| `resume-screener-backup` | Daily `pg_dump` into `./backups`, kept `BACKUP_KEEP_DAYS` days |

Postgres, Valkey and SeaweedFS are published on 127.0.0.1 only, for local
development. To process faster, raise `WORKER_CONCURRENCY`, or add a second
worker service (fixed container names rule out `--scale`).

Restore a backup:
`gunzip -c backups/<file>.sql.gz | docker exec -i resume-screener-postgres psql -U screener -d screener`

## Develop locally

```bash
docker compose up -d postgres valkey seaweedfs
cp .env.example .env          # then set JWT_SECRET and GOOGLE_CLIENT_ID
npm install
npm run start:dev             # API on :3000; applies migrations on start
npm run start:worker:dev      # worker (or set RUN_WORKER_IN_API=true)
```

Start the worker after the API has applied migrations.

## Change a company's plan

Companies are on the `standard` or `extended` plan (API rate limit per key
from `PLAN_STANDARD_RATE_LIMIT` / `PLAN_EXTENDED_RATE_LIMIT`). The platform
operator changes plans through the admin API, enabled by setting
`ADMIN_API_TOKEN` (32+ random characters):

```bash
curl -H "X-Admin-Token: $ADMIN_API_TOKEN" "https://localhost/api/v1/admin/companies?search=acme.com"
curl -X PATCH -H "X-Admin-Token: $ADMIN_API_TOKEN" -H "Content-Type: application/json"   -d '{"plan":"extended"}' https://localhost/api/v1/admin/companies/<companyId>/plan
```

Add `"customRateLimitPerMinute": 5000` for a custom limit, or `null` to remove it.

## Tests

For checking by hand (demo, review, a deployment), follow
[docs/manual-testing](docs/manual-testing/README.md); ready-made test
files are in `docs/manual-testing/files` (`npm run test-files` recreates them).

```bash
npm test                      # unit tests: pure logic, no services needed
npm run lint

# integration tests: the app against real Postgres, Valkey and SeaweedFS
docker compose up -d postgres valkey seaweedfs
npm run test:integration
```

All tests live in `test/`, apart from the code:

| Folder | What | Fakes |
|---|---|---|
| `test/unit/` | Pure functions and classes, mirroring `src/` | none, or plain objects |
| `test/integration/` | The whole app over HTTP and its services, one file per feature | only the edges: Google sign-in, the queue (recorded, except `worker.spec.ts`) and, where a test needs it, the pipeline stages |
| `test/support/` | Harness, documents, fixtures, scripted stages | |

Tests import the code as `@src/...`. The integration run recreates the
`screener_test` database from the migrations, clears Valkey database 1, and
each file starts from empty tables, so files can't see each other's data. It
fails with a clear message when a service is down instead of skipping tests.
Point it at other services with `TEST_DATABASE_URL`, `TEST_REDIS_URL` and
`TEST_S3_ENDPOINT` (see `test/support/test-env.ts`).

## API specification

`docs/openapi.json` is the API contract (OpenAPI 3), generated from the
controllers and DTOs. After changing an endpoint or DTO, regenerate it and
commit it with the change; a unit test fails while it is out of date:

```bash
npm run openapi               # no database or other services needed
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

Each stage is an abstract class in `src/processing/stages.ts`, bound in
`src/processing/processing.module.ts`:

| Stage | Implementation |
|---|---|
| Text extraction | `DocumentTextExtractor`: PDF via pdfjs, DOCX via its XML. Text a reader can't see (white without a dark background, tiny, transparent, invisible, off-page, hidden runs) is kept apart and never evaluated. Under 50 readable characters: "Could not read file". |
| Preprocessing | `RuleBasedResumePreprocessor`: keeps contacts for the recruiter; removes them, links, age, gender, nationality and similar from the model's text; removes sentences addressed to AI; flags hidden text or such sentences as "Possible manipulation". |
| Screening model | `SCREENING_MODEL=mock` (default): `MockScreeningModel`, deterministic keyword and alias matching plus experience from stated years or job dates. `gemini`: `GeminiScreeningModel`, Gemini Decision 1 (needs `GEMINI_API_KEY`). |
| Scoring | `WeightedScoringEngine`: `score = 100 × Σ(weight × confidence if met) / Σ weight`, per-requirement contributions, "Does not meet requirements" (confidently missing a mandatory requirement) and "Needs manual review" (unsure about one). |

### Connecting the screening model (Gemini Decision 1)

`GeminiScreeningModel` (`src/processing/screening/gemini-screening-model.ts`)
calls the Gemini Decisions API (`POST /v1beta/decisions`). The model answers
typed questions and never writes free text. The whole resume goes in one
request, with one `choice` question per skill requirement ("met" or
"not_met"); the model's confidence in its answer becomes the verdict's
confidence. Experience is not asked of the model: it is read from the text in
code, like in the mock model, which keeps it repeatable.

1. Create a key in Google AI Studio: https://aistudio.google.com/api-keys
   (sign in with a Google account, "Create API key").
2. In `.env`: `SCREENING_MODEL=gemini` and `GEMINI_API_KEY=...` (also
   `GEMINI_API_URL`, `GEMINI_MODEL` and `GEMINI_TIMEOUT_MS`; see `.env.example`).
3. On the free tier (200 requests and 50,000 tokens per minute) set
   `SCREENING_RATE_LIMIT_PER_SECOND=2` and `WORKER_CONCURRENCY=2`. Free-tier
   prompts may be used by Google to improve its products, so use test resumes
   only; real candidate data needs a paid project.
4. Restart the API and the worker.

Timeouts, 429 and 5xx are retried with backoff; other errors fail the resume
with a readable message (the details go to the log, never the key).
`MockScreeningModel` stays the default for development, tests and as a demo
fallback.
