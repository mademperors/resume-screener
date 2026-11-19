# Backend: what still has to be done

Ordered by importance for the MVP demo on 30.11.2026. "Owner" follows the
team roles in the project plan (ПР-1); adjust as needed.

## 1. Jev integration (Backend & AI engineer)

The rest of the system is ready; only the model call is missing.

1. Implement `src/processing/screening/jev-screening-model.ts`. The comment
   in that file lists the contract:
   - Send the resume text and the requirements.
   - Return exactly one verdict per requirement, with `met` and a confidence
     in 0..1, plus the skills found and the years of experience.
   - Set `modelName` and `modelVersion`.
   - Throw `ScreeningModelUnavailableError` for timeouts, 5xx and 429 (these
     are retried), and `PermanentProcessingError` otherwise.
2. Add Jev's settings (for example `JEV_API_URL`, `JEV_API_KEY`) to
   `src/config/env.validation.ts`, `.env.example` and the shared environment
   in `docker-compose.yml`. Never put the key in code.
3. Set `SCREENING_MODEL=jev`. Set `SCREENING_RATE_LIMIT_PER_SECOND` to Jev's
   API limit.
4. Calibrate on real resumes:
   - The "Needs manual review" threshold (0.6, `DEFAULT_MANUAL_REVIEW_CONFIDENCE`
     in `src/jobs/requirements.ts`).
   - The weights (required 2, preferred 1, experience 2, `REQUIREMENT_WEIGHTS`).
5. Check NFR 6.1: the same resume and job scored several times must stay
   within 5%. If Jev isn't fully deterministic, add a test that runs the
   same input N times.
6. Keep `MockScreeningModel` as the fallback for development, tests and the
   demo if Jev is unavailable.

## 2. Frontend (Frontend engineer)

The API is complete for every screen in SR 1.5.3; the contract is at
`/api/docs`. Points the frontend has to handle:

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

## 3. Other backend work, not frontend or Jev

### Needed before a real deployment

| # | Task | Why | Owner |
|---|---|---|---|
| 1 | **Run tests automatically on every change (CI).** GitHub Actions was left out on purpose; pick a CI (or add a workflow later) that runs `npm run lint`, `npm test` and `npm run test:e2e` with Postgres, Valkey and SeaweedFS as services. | NFR 9.2, SR 1.3.1.3 | QA & DevOps |
| 2 | **Production secrets and credentials.** Strong `JWT_SECRET`, `POSTGRES_PASSWORD`, new SeaweedFS keys in `docker/seaweedfs/s3.json` (and `S3_ACCESS_KEY_ID` / `S3_SECRET_ACCESS_KEY`), a real `GOOGLE_CLIENT_ID`. The repository only has development values. | NFR 9.3 | DevOps |
| 3 | **Real domains for HTTPS.** Point DNS for `API_DOMAIN` and `FILES_DOMAIN` to the server and open ports 80 and 443; Caddy then gets certificates automatically. | NFR 4.2 | DevOps |
| 4 | **Backups off the server, and a restore test.** Backups are only in `backend/backups` on the same machine. Copy them elsewhere (another disk or S3 bucket) and try a restore once (command in the README). | NFR 3.5 | DevOps |
| 5 | **Load test.** Check API p95 under 200 ms (NFR 1.5), list sorting and filtering under 1 s (NFR 1.2), and many simultaneous uploads (week 11 in the plan). Use the results to confirm the 4 vCPU / 8 GB server size (SR 1.3.1.5). | NFR 1.2, 1.5 | QA |
| 6 | **Monitoring and alerts.** Watch `/health/ready`, container restarts, queue length and the "Processing failed" share; collect logs. Needed to know whether the 99% availability target is met. | NFR 3.1 | DevOps |
| 7 | **Demo data.** A script or saved scenario that creates a few jobs and uploads sample resumes (strong, weak, unsure, manipulated) for the presentation. | Plan, week 12 | Backend |

### Smaller gaps in the backend

| # | Task | Why |
|---|---|---|
| 8 | **Changing a company's plan.** Nothing updates `companies.apiRateLimitPerMinute`; it can only be changed in the database. Add an admin endpoint or script when plans exist. | NFR 4.5 ("extended plan") |
| 9 | **Clean up old sessions.** Expired and revoked rows in `sessions` are never deleted. Add them to the hourly retention run. | Housekeeping |
| 10 | **Company and user management.** No roles, invitations or company renaming; a company is created automatically per Google Workspace domain or personal account. Enough for the MVP; decide whether recruiters from different domains must share a company. | Product decision |
| 11 | **Per-job weights and review threshold.** Fixed for now. Make them part of the job form if recruiters need to tune them; versioning already supports it. | NFR 6.2 (optional) |
| 12 | **Push updates instead of polling.** Optional: Server-Sent Events for progress if polling is too slow or heavy. | NFR 1.4 (optional) |
| 13 | **Fix the requirements text.** FR 2.1.1 still says email and password; NFR 4.1 and the code use Google sign-in only. | Report consistency |

### Known limitations to keep in mind

- The mock model matches keywords and aliases; it doesn't understand
  context ("no experience with Docker" counts as Docker). Jev replaces it.
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
- Several worker containers need several services in `docker-compose.yml`:
  fixed container names rule out `docker compose --scale`.

## 4. Housekeeping

- Update the Wrike tasks in "03 Розробка" to match this state.
- Decide whether the course PDFs in `docs/` belong in the repository (they
  are not committed).
- Delete the old development volumes left from before the compose project
  was renamed, if their data isn't needed:
  `docker volume rm backend_postgres-data backend_seaweedfs-data backend_valkey-data`.
