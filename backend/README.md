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

```bash
npm test                      # unit tests
npm run lint

# e2e: needs the docker compose services and a separate database
docker compose exec postgres psql -U screener -c "CREATE DATABASE screener_e2e"
DATABASE_URL=postgres://screener:screener@localhost:5432/screener_e2e npm run test:e2e
# add S3_ENDPOINT=http://localhost:8333 S3_ACCESS_KEY_ID=screener
# S3_SECRET_ACCESS_KEY=screener-dev-secret to also test real file storage
```

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
| Screening model | `SCREENING_MODEL=mock` (default): `MockScreeningModel`, deterministic keyword and alias matching plus experience from stated years or job dates. `jev`: `JevScreeningModel`, not implemented yet. |
| Scoring | `WeightedScoringEngine`: `score = 100 × Σ(weight × confidence if met) / Σ weight`, per-requirement contributions, "Does not meet requirements" (confidently missing a mandatory requirement) and "Needs manual review" (unsure about one). |

### Connecting Jev

Implement `JevScreeningModel` in
`src/processing/screening/jev-screening-model.ts`; its comment lists the
contract (one verdict per requirement with a confidence in 0..1, which errors
to throw, env variables for secrets). Then set `SCREENING_MODEL=jev`. Nothing
else needs to change. `MockScreeningModel` is a working example.
