# Agent notes

This project's **Baseline target is Baseline 2024**.

## Frontend (`frontend/`)

- Vite + React + TypeScript, Tailwind CSS with shadcn-style primitives, react-hook-form + zod.
- API contract: `backend/docs/openapi.json` (served at `/api/docs` when the backend runs).
- Development uses **MSW** with an in-memory mock backend, including a demo sign-in — no Google client ID or Docker required.
- Tests: Vitest + Testing Library + MSW (`npm test` in `frontend/`).
- Modern Web Guidance is installed at `.agents/skills/modern-web-guidance`. Consult it for forms, dialogs, accessibility and modern platform features:
  `npx modern-web-guidance@latest search "accessible form validation"`.
