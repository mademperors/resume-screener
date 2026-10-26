# Resume Screener — Frontend

Recruiter web client for the Resume Screener MVP. Vite + React + TypeScript, Tailwind CSS with shadcn-style primitives, react-hook-form + zod validation, and MSW mocks for API-less development.

See the [project README](../README.md) for product context and requirements.

## Scripts

| Command             | Description                                                 |
| ------------------- | ----------------------------------------------------------- |
| `npm run dev`       | Dev server with MSW mocks (http://localhost:5173)           |
| `npm test`          | Unit and integration tests (Vitest + Testing Library + MSW) |
| `npm run typecheck` | Type-check with `tsc -b`                                    |
| `npm run lint`      | Lint with oxlint                                            |
| `npm run format`    | Format with Prettier                                        |
| `npm run build`     | Production build                                            |

## Backend integration

Mocks are enabled in development. To use a real backend:

```bash
VITE_MOCKS=false VITE_API_BASE_URL=http://localhost:3000/api/v1 npm run dev
```

If `VITE_API_BASE_URL` is omitted, requests go to `/api/v1` and Vite proxies `/api` to `http://localhost:3000`.

Expected endpoints (see `src/features/jobs/api.ts`):

- `GET /jobs`
- `GET /jobs/:jobId`
- `POST /jobs`
- `PATCH /jobs/:jobId`
- `DELETE /jobs/:jobId`
