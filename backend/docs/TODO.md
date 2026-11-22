# Backend: what still has to be done

Ordered by importance for the MVP demo on 30.11.2026. "Owner" follows the
team roles in the project plan (ПР-1); adjust as needed.

## 1. Screening model: Gemini Decision 1 (Backend & AI engineer)

`GeminiScreeningModel` is written and unit-tested against a stubbed API (see
"Connecting the screening model" in the README). It has **not been run against
the real API yet**: that needs a key from https://aistudio.google.com/api-keys.
What is left:

1. Create the key, set `SCREENING_MODEL=gemini` and `GEMINI_API_KEY`, upload
   the files from `docs/manual-testing/files/` and check the verdicts. Confirm
   the request format against the real API (question keys, the `choice`
   answer shape).
2. Free tier limits: 200 requests and 50,000 tokens per minute. Set
   `SCREENING_RATE_LIMIT_PER_SECOND=2` and `WORKER_CONCURRENCY=2`; Google 429
   answers are retried. Free-tier prompts may be used to improve Google's
   products: test resumes only. A paid project is needed for real candidate
   data.
3. Check that the Gemini API is available from the deployment region (it was
   not verified for Ukraine).
4. Calibrate on real resumes. For a choice question the confidence is the
   probability of the chosen answer (0.5 to 1), so the default "Needs manual
   review" threshold of 0.6 means 60% sure. Adjust the threshold and the
   weights (`DEFAULT_SCORING` in `src/jobs/requirements.ts`) if too many or
   too few candidates land in manual review. Jobs can override them through
   their `scoring` settings.
5. Check NFR 6.1: score the same resume and job several times; results must
   stay within 5%. The API has no temperature setting, so measure it, and add
   a test (or script) that repeats the same input N times.
6. Decide whether to show recruiters more than "Found in the resume" as
   evidence: the model returns no quote, only an answer and its confidence.
7. Resumes over 150,000 characters are cut (the model reads up to 262,144
   tokens). Check this on real resumes.
8. Text analysis is slow on one pathological input: a single 300,000-character
   "word" takes about 20 seconds in `estimateExperience` (found while testing).
   Normal resumes take milliseconds; consider a length cap before extraction.
9. Keep `MockScreeningModel` as the fallback for development, tests and the
   demo if the API is unavailable.

## 2. Frontend (Frontend engineer)

The API is complete for every screen in SR 1.5.3; the contract is
`docs/openapi.json` (also served at `/api/docs` when running). Points the frontend has to handle:

- **Sign-in:** Google Identity Services gives an ID token; send it to
  `POST /auth/google`. The access token lasts 15 minutes, so refresh it with
  `POST /auth/refresh`. Refreshing does not count as activity, so the
  30-minute idle sign-out still works. On 401, go to the sign-in screen.
- **Upload:** send `multipart/form-data` with a `files` field, at most 20
  files per request; split bigger selections. Show each file's result.
  For `duplicate`, offer to upload it anyway with `?onDuplicate=keep`.
- **Progress:** poll `GET /jobs/{id}/progress` every 2–3 seconds while
  `done` is false, then show `summary` (NFR 1.4).
- **Candidate list:** default sort is match score. Show candidates with
  `belowThreshold: true` in a separate section at the bottom. Show "No
  candidates found" with a Reset filters button when the list is empty.
- **Requirement changes:** when `PATCH /jobs/{id}` returns
  `rescoreSuggested: true`, offer to call `POST /jobs/{id}/rescore`.
- **Scoring settings:** the job form can offer an advanced section for
  `scoring` (weights, per-skill weights, review threshold); the defaults
  work without it.
- **Plan:** `GET /auth/me` returns the company's plan and API limit, for an
  account or API keys page.
- **Original file:** call `GET /candidates/{id}/resume-file` and open the
  returned `url` (it expires in 5 minutes, so fetch it on click).
- **CSV export:** download with `fetch` (it needs the auth header) and save
  the blob. Disable the button when the list is empty (FR 2.10.3).
- **Print report:** build the print view from `GET /jobs/{id}/report`.
- **Deletion:** ask for confirmation before `DELETE /candidates/{id}`
  (FR 2.12.2).
- **Errors:** show `message`; for 400 also highlight `errors[].field`.
- **Backend settings:** set `CORS_ORIGINS` to the frontend's address. To
  serve the frontend from the same Caddy, add a site or route in
  `docker/caddy/Caddyfile` and a service in `docker-compose.yml`.

## 3. Other backend work, not frontend or the model

### Needed before a real deployment

| # | Task | Why | Owner |
|---|---|---|---|
| 1 | ~~**Run tests automatically on every change (CI).**~~ Done: `.github/workflows/ci.yml` runs lint, Prettier, build, unit and integration tests (Postgres, Valkey, SeaweedFS) for the backend, and typecheck, lint, Prettier, tests, build and mocked Playwright for the frontend, plus a Docker image build. `publish-image.yml` pushes the backend image to GHCR on merges to `main`. Still to do: mark the **CI passed** check as required in the branch protection rules, and decide where the image is deployed. | NFR 9.2, SR 1.3.1.3 | QA & DevOps |
| 2 | **Production secrets and credentials.** In the server's `.env`: strong `JWT_SECRET`, `POSTGRES_PASSWORD`, `S3_ACCESS_KEY_ID` / `S3_SECRET_ACCESS_KEY` (SeaweedFS takes the same ones), a real `GOOGLE_CLIENT_ID`. `.env.example` only has development values. Note that changing `POSTGRES_PASSWORD` after the first start doesn't change it inside an existing database volume. | NFR 9.3 | DevOps |
| 3 | **Real domains for HTTPS.** Point DNS for `API_DOMAIN` and `FILES_DOMAIN` to the server and open ports 80 and 443; Caddy then gets certificates automatically. | NFR 4.2 | DevOps |
| 4 | **Backups off the server, and a restore test.** Backups are only in `backend/backups` on the same machine. Copy them elsewhere (another disk or S3 bucket) and try a restore once (command in the README). | NFR 3.5 | DevOps |
| 5 | **Load test.** Check API p95 under 200 ms (NFR 1.5), list sorting and filtering under 1 s (NFR 1.2), and many simultaneous uploads (week 11 in the plan). Use the results to confirm the 4 vCPU / 8 GB server size (SR 1.3.1.5). | NFR 1.2, 1.5 | QA |
| 6 | **Monitoring and alerts.** Watch `/health/ready`, container restarts, queue length and the "Processing failed" share; collect logs. Needed to know whether the 99% availability target is met. | NFR 3.1 | DevOps |
| 7 | **Demo data.** A script or saved scenario that creates a few jobs and uploads sample resumes (strong, weak, unsure, manipulated) for the presentation. | Plan, week 12 | Backend |

### Smaller gaps in the backend

| # | Task | Why |
|---|---|---|
| 8 | **Billing.** Plans exist and the operator changes them through the admin API; there is no payment or self-service upgrade. Set `ADMIN_API_TOKEN` in production to use the admin API. | NFR 4.5 |
| 9 | **Company and user management.** No roles, invitations or company renaming; a company is created automatically per Google Workspace domain or personal account. Enough for the MVP; decide whether recruiters from different domains must share a company. | Product decision |
| 10 | **Push updates instead of polling.** Optional: Server-Sent Events for progress if polling is too slow or heavy. | NFR 1.4 (optional) |
| 11 | **Fix the requirements text.** FR 2.1.1 still says email and password; NFR 4.1 and the code use Google sign-in only. | Report consistency |

### Known limitations to keep in mind

- The mock model matches keywords and aliases; it doesn't understand
  context ("no experience with Docker" counts as Docker). The real model replaces it.
- Name detection uses the first short line that looks like a name; unusual
  layouts can give an empty name (the recruiter still sees the file).
- Prompt-injection detection uses a fixed list of phrases. New wording can
  get through, but hidden text is always excluded regardless.
- Hidden-text detection doesn't catch text covered by an image, text the
  same colour as a non-white background, or text cut off by a clipping path.
- Scanned resumes are not read (no OCR); they get "Could not read file", as
  the requirements specify.
- The duplicate check compares exact file contents within one job; the same
  person's resume in two formats counts as two candidates.

## 4. Housekeeping

- Update the Wrike tasks in "03 Розробка" to match this state.
- Decide whether the course PDFs in `docs/` belong in the repository (they
  are not committed).
- Delete the old development volumes left from before the compose project
  was renamed, if their data isn't needed:
  `docker volume rm backend_postgres-data backend_seaweedfs-data backend_valkey-data`.
