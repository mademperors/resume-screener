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
| All settings: defaults / secrets | `backend/.env.defaults` / `backend/.env.example` |

By role:

- **Frontend:** `backend/docs/openapi.json` plus the "Frontend" section of
  `backend/docs/TODO.md` (auth flow, upload limits, polling, below-threshold
  section, CSV download). You don't need to read backend source. With the
  stack running, the same spec is at `https://localhost/api/docs-json`
  (interactive: `/api/docs`).
- **Screening model:** `backend/src/processing/stages.ts` (the
  `ScreeningModel` contract), `screening/gemini-*.ts` (client, typed
  questions, model) and `screening/mock-screening-model.ts` as examples. A
  new model needs its settings in `src/config/screening.config.ts` and an
  entry in `screening/screening-model.provider.ts`; the compiler flags a
  missing one. A new file format: a `DocumentReader` listed in
  `extraction/text-extraction.providers.ts` (plus `resumes/file-type.ts`).
- **Backend:** code is grouped by feature under `backend/src/` (`jobs`,
  `resumes`, `candidates`, `processing`, `export`, `admin`, ...). The resume
  pipeline is in `backend/src/processing/`. Layers per feature: controller →
  service (rules, tenant checks) → repository (all TypeORM). Each
  `*-data.module.ts` exports a feature's repositories and depends on nothing
  else, so features can read each other's data without import cycles.

## Rules for changes

- **API changes:** after changing any controller or DTO, run
  `npm run openapi` in `backend/` and commit `backend/docs/openapi.json` in
  the same commit. A unit test fails while the file is out of date.
- **Database changes:** never use `synchronize`. Change the entity, run
  `npm run migration:generate -- src/database/migrations/<Name>`, review the
  SQL, and add the class to `src/database/migrations/index.ts`.
- **New settings:** add the variable to the zod schema of the namespace it
  belongs to in `src/config/*.config.ts` (or a new `defineConfig` file; use
  the `envVar` helpers for numbers, booleans, URLs, lists), with no default in
  code. Put its default in `.env.defaults`; a secret goes in `.env.example`
  with an empty or development value instead. A new namespace goes in
  `ALL_CONFIGS` in `src/config/config.module.ts` (loaded globally). Touch
  `docker-compose.yml` only for values that differ inside the Docker network.
- **Data access:** TypeORM queries live only in `*.repository.ts`. A module
  owns the entities in its folder; other modules go through its repository
  or service, never `Repository<TheirEntity>`, `manager.find(TheirEntity)`
  or raw SQL on its tables. Services use `DataSource` only to open a
  transaction (`db.transaction(tx => ...)`) and pass `tx` to repository
  methods, so a change across modules stays atomic.
- **Tenant isolation:** load company-owned records through
  `assertOwnedByCompany` (or a service's `getOwned`), so another company's
  record answers 403.
- **Personal data:** contacts and protected attributes never go to the
  screening model; preprocessing removes them.
- **Error messages** are readable English without technical codes; they go
  through the global exception filter.
- **Code style:** ES modules with `.js` in relative imports; abstract classes
  as DI tokens for replaceable parts at the edges (storage, queue, pipeline
  stages, `IdentityVerifier`, `RateLimiter`). Don't wrap things that have one
  implementation and no external dependency.
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
