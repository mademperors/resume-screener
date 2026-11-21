# Resume Screener — Frontend

Recruiter web client for the Resume Screening MVP: Google sign-in, job management, resume uploads with live processing progress, ranked candidate review, CSV export and printable reports.

Built with Vite + React + TypeScript, Tailwind CSS with shadcn-style primitives, react-hook-form + zod, MSW mocks, and Vitest + Testing Library.

See the [project README](../README.md) for product context. The API contract is `backend/docs/openapi.json` in the backend PR (served at `/api/docs` when the backend runs).

## Scripts

| Command             | Description                                                 |
| ------------------- | ----------------------------------------------------------- |
| `npm run dev`       | Dev server with MSW mocks (http://localhost:5173)           |
| `npm test`          | Unit and integration tests (Vitest + Testing Library + MSW) |
| `npm run typecheck` | Type-check with `tsc -b`                                    |
| `npm run lint`      | Lint with oxlint                                            |
| `npm run format`    | Format with Prettier                                        |
| `npm run build`     | Production build                                            |

## Development setup

```bash
npm install
cp .env.example .env.local   # optional
npm run dev
```

Without configuration the app runs fully against MSW: on the sign-in screen choose **Continue with demo account**. The mock backend seeds three jobs, resumes, candidates, reports and an API key.

## Connecting the real backend

```bash
# .env.local
VITE_MOCKS=false
VITE_API_BASE_URL=http://localhost:3000/api/v1   # or https://localhost/api/v1
VITE_GOOGLE_CLIENT_ID=<your Google OAuth client ID>
```

The backend must allow the frontend origin via `CORS_ORIGINS` (for example `http://localhost:5173`). With `VITE_API_BASE_URL` unset, requests go to `/api/v1` and Vite proxies `/api` to `http://localhost:3000`.

## Backend endpoints used

- Auth: `POST /auth/google`, `POST /auth/refresh`, `POST /auth/logout`, `GET /auth/me`
- Jobs: CRUD, `POST /jobs/{id}/close`, `/reopen`, `/rescore`
- Resumes: `POST/GET /jobs/{id}/resumes` (multipart `files`, `onDuplicate=skip|keep`), `GET /jobs/{id}/progress`, per-resume and bulk retry
- Candidates: list with filters/sorting/pagination, detail, status update, delete, short-lived resume file link, CSV export
- Reports: `GET /jobs/{id}/report`
- API keys: `GET/POST/DELETE /api-keys`

## Behaviour notes

- The access token is kept in memory; the rotating refresh token is stored in `sessionStorage` (per-tab session). A 401 triggers one silent refresh before signing out.
- Sign-out after 30 minutes without user activity; background token refreshes do not count as activity.
- Uploads are checked client-side (PDF/DOCX, ≤ 10 MB) and sent in batches of up to 20 files.
- Progress is polled every 2.5 seconds until processing is done.
- Candidates below the job's minimum match score are shown in a separate "Below threshold" section.
- CSV export reuses the current filters and is disabled when the list is empty (FR 2.10.3).

## Notes

- The frontend targets Baseline 2024 browsers (current Chrome, Firefox, Edge, Safari).
- Modern Web Guidance is installed at `.agents/skills/modern-web-guidance` for future changes.
