#!/usr/bin/env node
/**
 * Seeds deterministic data for the backend E2E suites:
 *   - an "E2E Company" with an "E2E Recruiter" user,
 *   - an API key for API-level tests,
 *   - a session with a known refresh token so the browser can skip Google.
 *
 * Requires the backend's Postgres container to be running:
 *   docker compose up -d postgres valkey seaweedfs
 *
 * Safe to run repeatedly: it resets the session/API key to known values.
 */
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'

export const API_KEY = `rsk_e2e0e2e0e2e0_${'A'.repeat(43)}`
export const REFRESH_TOKEN = 'e2e-playwright-refresh-token'

const sha256 = (value) => createHash('sha256').update(value).digest('hex')

const sql = `
INSERT INTO companies (id, name, "googleDomain", plan, "customRateLimitPerMinute")
VALUES ('11111111-1111-4111-8111-111111111111', 'E2E Company', NULL, 'standard', NULL)
ON CONFLICT (id) DO NOTHING;

INSERT INTO users (id, "googleSubject", email, name, "avatarUrl", "companyId", "lastLoginAt")
VALUES ('22222222-2222-4222-8222-222222222222', 'e2e-google-subject', 'e2e@example.com',
        'E2E Recruiter', NULL, '11111111-1111-4111-8111-111111111111', NULL)
ON CONFLICT ("googleSubject") DO UPDATE SET "companyId" = EXCLUDED."companyId";

INSERT INTO api_keys (id, "companyId", "createdByUserId", name, prefix, "keyHash", "lastUsedAt", "revokedAt")
VALUES ('33333333-3333-4333-8333-333333333333', '11111111-1111-4111-8111-111111111111',
        '22222222-2222-4222-8222-222222222222', 'E2E Playwright', 'e2e0e2e0e2e0', '${sha256(API_KEY)}', NULL, NULL)
ON CONFLICT (prefix) DO UPDATE SET "keyHash" = EXCLUDED."keyHash", "revokedAt" = NULL,
  "companyId" = EXCLUDED."companyId", "createdByUserId" = EXCLUDED."createdByUserId";

INSERT INTO sessions (id, "userId", "refreshTokenHash", "lastActivityAt", "expiresAt", "revokedAt")
VALUES ('44444444-4444-4444-8444-444444444444', '22222222-2222-4222-8222-222222222222',
        '${sha256(REFRESH_TOKEN)}', now(), now() + interval '7 days', NULL)
ON CONFLICT (id) DO UPDATE SET "refreshTokenHash" = EXCLUDED."refreshTokenHash",
  "lastActivityAt" = now(), "expiresAt" = now() + interval '7 days', "revokedAt" = NULL;
`

try {
  execFileSync(
    'docker',
    ['exec', '-i', 'resume-screener-postgres', 'psql', '-U', 'screener', '-d', 'screener', '-q'],
    { input: sql, stdio: ['pipe', 'inherit', 'inherit'] },
  )
  console.log('E2E data seeded (company, user, API key, session).')
  console.log(`BACKEND_API_KEY=${API_KEY}`)
  console.log(`E2E_REFRESH_TOKEN=${REFRESH_TOKEN}`)
} catch {
  console.error('Could not seed the E2E data. Is the backend Postgres container running?')
  console.error('Run: cd backend && docker compose up -d postgres valkey seaweedfs')
  process.exit(1)
}
