# Backend: what is done

State of the backend as of 20.11.2026 (commits `718beab` to `3bee3e2` on `main`).
Requirement numbers refer to the course reports: functional (ПР-2, "FR"),
non-functional (ПР-3, "NFR") and system requirements (ПР-4, "SR").

**Summary:** the backend is complete for the MVP. The Gemini model is connected
(`SCREENING_MODEL=gemini`, not yet calibrated on real resumes); a deterministic
mock is the default. It runs with one command in Docker,
and 133 unit tests plus 71 end-to-end tests pass against real Postgres,
Valkey and SeaweedFS.

## Stack

| Part | Choice |
|---|---|
| API | NestJS 12, TypeScript, REST under `/api/v1`, OpenAPI at `/api/docs` |
| Database | PostgreSQL 17, TypeORM with migrations (no auto-sync) |
| Queue | BullMQ on Valkey 8 (open-source Redis fork) |
| File storage | SeaweedFS through its S3 API, volumes encrypted |
| HTTPS | Caddy (local certificates for `*.localhost`, Let's Encrypt for real domains) |
| Tests | Vitest: unit tests in `test/unit/`, integration tests against real Postgres, Valkey and SeaweedFS in `test/integration/` |

## Authentication and companies (FR 2.1, NFR 4.1–4.5, SR 1.1.3)

- Sign-in only with Google: the frontend sends Google's ID token to
  `POST /auth/google` and gets a short access token (JWT) and a refresh token.
  No passwords are stored.
- Sessions end after 30 minutes without activity (`SESSION_IDLE_TIMEOUT_MINUTES`);
  refresh tokens are single-use; `POST /auth/logout` ends the session.
- Multi-tenancy: users from one Google Workspace domain share a company;
  personal Google accounts each get their own. Every request runs in the
  context of one company. Another company's record answers **403**.
- API keys for external systems (`X-API-Key` header): created, listed and
  revoked from the web app only, stored as SHA-256 hashes, shown once.
  Missing or wrong key answers **401**.
- Rate limit per API key: counted in Valkey so it holds across API
  instances; **429** with `Retry-After` above it. If Valkey is down,
  requests are let through.
- Plans (NFR 4.5): each company is on the **standard** (200 requests per
  minute per key) or **extended** plan (1000); both limits are configurable
  (`PLAN_STANDARD_RATE_LIMIT`, `PLAN_EXTENDED_RATE_LIMIT`). A company can
  also have a custom limit. `GET /auth/me` shows the plan and the limit in
  effect.
- Admin API for the platform operator (`/admin`, header `X-Admin-Token`,
  enabled by `ADMIN_API_TOKEN`): list plans, find companies, change a
  company's plan or custom limit. Changes apply on the next request.
- Sessions that ended (signed out, expired or idle) are deleted by the
  hourly retention run.

## Jobs (FR 2.2, 2.3, NFR 6.2)

- Create, list, get, update, close, reopen and delete jobs: title,
  description, required skills (mandatory), preferred skills, minimum
  experience, minimum match score (0–100).
- Skills are trimmed and de-duplicated; a skill can't be both required and
  preferred. Invalid input returns a readable message per field.
- Requirements are frozen into **scoring config versions**. Changing skills or
  experience creates a new version; each evaluation records the version and
  model it used. After such a change the response says `rescoreSuggested`,
  and `POST /jobs/{id}/rescore` scores the resumes again. Recruiter decisions
  are kept.
- Each job has its own scoring settings, optional when creating it:
  weights for required skills (default 2), preferred skills (1) and
  experience (2), per-skill weights (e.g. Kotlin 4), and the "Needs manual
  review" confidence threshold (0.6). Changing them creates a new config
  version and suggests a re-score, like changing requirements.
- Changing the minimum score only moves candidates above or below the line.
- Deleting a job is a soft delete; data is purged later by retention.

## Resume upload (FR 2.4)

- `POST /jobs/{id}/resumes` accepts up to 20 PDF or DOCX files per request
  and returns a result per file: accepted, rejected with the reason ("File is
  too large (max 10 MB).", "Unsupported file format…"), or duplicate. One
  bad file doesn't stop the others.
- The file type is detected from the content, not the name. Non-ASCII file
  names are kept.
- Duplicates (same content in the same job) are reported and skipped;
  `?onDuplicate=keep` uploads them anyway.
- Each file is stored, saved as `Queued`, then queued (NFR 3.2: nothing is
  lost if queueing fails). Closed jobs don't accept uploads.
- Original files are available through a short-lived signed link
  (`RESUME_DOWNLOAD_URL_TTL_SECONDS`, 5 minutes by default; NFR 4.6).

## Processing pipeline (FR 2.5, 2.7, NFR 1.3, 2.2, 2.3, 3.2–3.4, SR 1.1.4–1.1.8)

Runs in the worker process (`src/processing`):
**text extraction → preprocessing → screening model → scoring**.
Each stage is an interface, so it can be replaced without touching the rest.

| Stage | What it does |
|---|---|
| Text extraction | PDF via pdfjs, DOCX from its XML (headers, body, tables, text boxes, footers). Text a reader can't see is set aside and never evaluated: white text without a dark background, tiny, transparent, invisible or off-page text, hidden Word runs. White text on a coloured sidebar counts as visible. Fewer than 50 readable characters (a scan) gives "Could not read file". |
| Preprocessing | Finds the name, email, phone and location for the recruiter, then removes them, links, and age, gender, nationality and similar from the text the model sees (FR 2.7.3, NFR 5.3). Removes sentences addressed to AI ("ignore previous instructions…", English, Ukrainian, Russian). Hidden text or such sentences flag **Possible manipulation**, with the reason shown on the card. |
| Screening model | `SCREENING_MODEL=mock` (default): `MockScreeningModel`, deterministic keyword and alias matching for skills, and experience from stated years or job dates (education skipped). Returns a verdict and a confidence (0–1) per requirement. `gemini`: `GeminiScreeningModel`: one request to the Gemini Decisions API (`gemini-decision-1`) per resume, one `choice` question (met / not met) per skill, the model's confidence becomes the verdict's confidence. Experience and the skills list come from the text, not from the model. Needs `GEMINI_API_KEY`. |
| Scoring | `score = 100 × Σ(weight × confidence, if met) / Σ weight`, with the job's weights. Each requirement's points are stored. Flags: **Does not meet requirements** (confidently missing a mandatory requirement) and **Needs manual review** (confidence under the job's threshold on a mandatory requirement). The model never sets the score (NFR 6.3, SR 1.1.8). |

The model's result is checked before scoring: one verdict per requirement,
confidences within 0..1. Same input gives the same result (NFR 6.1).

**Reliability:**

- One resume and config version is one queue task (NFR 3.3).
- Temporary failures (model or storage unavailable) are retried with
  exponential backoff, then marked "Processing failed" (NFR 3.4).
- One resume failing never stops others (FR 2.5.6).
- A scheduled sweep, run once per minute across all workers, re-queues
  resumes stuck in Queued or Processing. It also retries temporary failures
  up to 3 times.
- Recruiters can retry one resume or all failed resumes of a job (FR 2.6.3).
- Requests to the model are limited per second across all workers
  (`SCREENING_RATE_LIMIT_PER_SECOND`).
- Scale out by running more workers, or up with `WORKER_CONCURRENCY` (NFR 2.2).

## Candidates, progress, export (FR 2.6, 2.8–2.10, 2.12)

- **Progress:** `GET /jobs/{id}/progress` returns the counters and a summary
  such as "Processed 48 of 50, 2 failed". The frontend polls it.
- **Candidate list:** `GET /jobs/{id}/candidates`, sorted by match score by
  default and by any column on request. Candidates below the minimum score
  always come last, not removed (FR 2.8.6). Filters: skills (all of the
  given ones), minimum experience, minimum score, has warnings, decision.
  Paginated.
- **Candidate card:** contacts, score, found and missing skills, each
  requirement with its verdict, evidence and points, warnings with reasons,
  the config and model version used, and a link to the original file.
- **Decision:** Pending / Approved / Rejected.
- **Deletion:** deleting a candidate or a resume removes the database rows
  and the file. Files that storage can't delete right away are recorded and
  retried until they are gone (NFR 5.1).
- **CSV export:** `GET /jobs/{id}/candidates/export.csv` uses the same filters
  and order as the list. It is UTF-8 with a byte order mark for Excel, and
  values that a spreadsheet would run as formulas are defused.
- **Job report:** `GET /jobs/{id}/report` returns JSON for a print view:
  counts, score distribution, decisions, how many candidates meet each
  requirement, and the top candidates.

## Data protection (NFR 5)

- Retention: a year after a job is closed or deleted (`RETENTION_DAYS`), its
  candidates, resumes, evaluations and files are deleted. It runs hourly in
  the worker and also retries pending file deletions.
- Candidate data goes only to the screening model, and only without contacts.

## Operations (NFR 3.5, 9.1, 9.3, SR 1.3)

- `docker compose up -d --build` starts the project `resume-screener-backend`:
  `resume-screener-postgres`, `-valkey`, `-seaweedfs`, `-migrate` (applies
  migrations and exits), `-api`, `-worker`, `-caddy`, `-backup`.
- HTTPS through Caddy with HTTP redirected and HSTS set:
  `https://localhost/api/v1`, file links at `https://files.localhost`.
- Daily compressed database dump in `backend/backups`, kept 7 days.
- `GET /health` (alive) and `GET /health/ready` (database, queue, storage),
  used by the container health checks.
- All secrets and settings come from environment variables; every one is
  documented in `.env.example`.
- Errors always have the same shape with a readable English message, plus
  per-field details for invalid input (NFR 7.1).

## API overview

All under `/api/v1`. Signed-in users send `Authorization: Bearer <token>`;
external systems send `X-API-Key`.

| Method and path | Purpose |
|---|---|
| `POST /auth/google`, `POST /auth/refresh`, `POST /auth/logout`, `GET /auth/me` | Sign-in and session |
| `GET/POST /api-keys`, `DELETE /api-keys/{id}` | API keys (web app only) |
| `GET/POST /jobs`, `GET/PATCH/DELETE /jobs/{id}` | Jobs |
| `POST /jobs/{id}/close`, `POST /jobs/{id}/reopen` | Close or reopen a job |
| `POST /jobs/{id}/rescore` | Score resumes again after requirement changes |
| `POST /jobs/{id}/resumes`, `GET /jobs/{id}/resumes` | Upload and list resumes |
| `GET /jobs/{id}/progress` | Processing counters |
| `POST /jobs/{id}/resumes/retry-failed`, `POST /resumes/{id}/retry`, `DELETE /resumes/{id}` | Retry or delete resumes |
| `GET /jobs/{id}/candidates` | Ranked, filterable candidate list |
| `GET /candidates/{id}`, `PATCH /candidates/{id}/status`, `DELETE /candidates/{id}` | Candidate card, decision, deletion |
| `GET /candidates/{id}/resume-file` | Short-lived link to the original file |
| `GET /jobs/{id}/candidates/export.csv`, `GET /jobs/{id}/report` | Export and report |
| `GET /health`, `GET /health/ready` | Health |
| `GET /admin/plans`, `GET /admin/companies`, `PATCH /admin/companies/{id}/plan` | Plans, for the platform operator (`X-Admin-Token`) |

The full contract, with request and response schemas, is committed as
`docs/openapi.json` (regenerate with `npm run openapi`; a test fails if it
is out of date). With the API running it is also at `/api/docs`
(JSON at `/api/docs-json`).
