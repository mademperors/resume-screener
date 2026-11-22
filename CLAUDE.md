# Resume Screener

Resume screening and ranking system with typed AI models (Gemini Decision 1). Course
project; MVP demo on 30.11.2026.

- `backend/`: NestJS API and worker. Complete for the MVP; the Gemini model is
  connected (`SCREENING_MODEL=gemini`) but not calibrated yet, a deterministic mock
  is the default.
- `frontend/`: Vite + React recruiter web client (see `frontend/README.md`).

## Where to look first

Read these before exploring the code; they're shorter and kept current.

| Need | File |
|---|---|
| **API contract**: every endpoint, request/response schema, enum, validation limit and error shape | `backend/docs/openapi.json` (OpenAPI 3, generated from the code) |
| What the backend does, by area, with requirement numbers | `backend/docs/DONE.md` |
| What's left: model steps, what the frontend must handle, deployment | `backend/docs/TODO.md` |
| Running, testing, Docker, migrations, plans | `backend/README.md` |
| How to test by hand, step by step with expected results | `backend/docs/manual-testing/README.md` (test files in `files/`) |
| All settings | `backend/.env.example` |

By role:

- **Frontend:** `backend/docs/openapi.json` plus the "Frontend" section of
  `backend/docs/TODO.md` (auth flow, upload limits, polling, below-threshold
  section, CSV download). You don't need to read backend source. With the
  stack running, the same spec is at `https://localhost/api/docs-json`
  (interactive: `/api/docs`).
- **Screening model:** `backend/src/processing/screening/gemini-screening-model.ts`
  (contract in its comment), `backend/src/processing/stages.ts` (the
  interfaces), and `backend/src/processing/screening/mock-screening-model.ts`
  as a working example. Nothing else needs to change.
- **Backend:** code is grouped by feature under `backend/src/` (`jobs`,
  `resumes`, `candidates`, `processing`, `export`, `admin`, ...). The resume
  pipeline is in `backend/src/processing/`.

## Rules for changes

- **API changes:** after changing any controller or DTO, run
  `npm run openapi` in `backend/` and commit `backend/docs/openapi.json` in
  the same commit. A unit test fails while the file is out of date.
- **Database changes:** never use `synchronize`. Change the entity, run
  `npm run migration:generate -- src/database/migrations/<Name>`, review the
  SQL, and add the class to `src/database/migrations/index.ts`.
- **New settings:** add them to `src/config/env.validation.ts`,
  `.env.example`, and, if containers need them, `docker-compose.yml`.
  Secrets come only from the environment.
- **Tenant isolation:** load company-owned records through
  `assertOwnedByCompany` (or a service's `getOwned`), so another company's
  record answers 403.
- **Personal data:** contacts and protected attributes never go to the
  screening model; preprocessing removes them.
- **Error messages** are readable English without technical codes; they go
  through the global exception filter.
- **Code style:** ES modules with `.js` in relative imports; abstract classes
  as DI tokens for replaceable parts (storage, queue, pipeline stages).
- **Tests:** in `backend/test/`, never next to the code. Pure logic goes in
  `test/unit/`; anything touching the database, Redis or storage is an
  integration test in `test/integration/` against the real services. Don't
  fake repositories or TypeORM; fake only external edges (Google, the
  screening model).
- **Before committing:** `npm run lint`, `npm test`, and for behaviour
  changes `npm run test:integration` (needs the Docker services; see the README).
- **Commits:** no AI co-author or "generated with" lines in commit messages.
- **Docs:** when something in `DONE.md` or `TODO.md` changes, update it in
  the same commit.
