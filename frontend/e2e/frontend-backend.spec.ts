import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { expect, test } from '@playwright/test'

/**
 * Runs the real UI against the real backend, skipping Google sign-in by
 * injecting a seeded refresh token into sessionStorage.
 *
 * Prerequisites:
 *   1. Backend running (docker compose services + API + worker on :3000).
 *   2. A session seeded for the E2E user with a known refresh token (see
 *      frontend/README.md).
 *   3. E2E_REAL=1 and optionally E2E_REFRESH_TOKEN=... BACKEND_API_KEY=...
 *
 * Test mode switches the frontend dev server to VITE_MOCKS=false.
 */

const REFRESH_TOKEN = process.env.E2E_REFRESH_TOKEN ?? 'e2e-playwright-refresh-token'
const FILES_DIR = fileURLToPath(
  new URL('../../backend/docs/manual-testing/files/', import.meta.url),
)

test.describe('frontend against the real backend', () => {
  test.skip(process.env.E2E_REAL !== '1', 'Set E2E_REAL=1 to test against the real backend')

  test.beforeEach(async ({ context }) => {
    await context.addInitScript((token) => {
      sessionStorage.setItem('rs_refresh_token', token)
    }, REFRESH_TOKEN)
  })

  test('create job, upload resume, rank candidate, export, report, delete', async ({ page }) => {
    const title = `E2E UI Job ${Date.now()}`

    await page.goto('/')
    await expect(page.getByRole('heading', { name: 'Jobs' })).toBeVisible({ timeout: 20_000 })
    await expect(page.getByText('E2E Recruiter')).toBeVisible()

    await page.getByRole('link', { name: 'New job' }).click()
    await page.getByLabel(/Job title/).fill(title)
    await page.getByLabel(/Description/).fill('Created by the real-backend Playwright test.')
    await page.getByLabel(/Required skills/).fill('TypeScript')
    await page.getByLabel(/Required skills/).press('Enter')

    const experience = page.getByLabel(/Minimum experience/)
    await experience.fill('')
    await experience.fill('3')

    await page.getByLabel('Minimum match score value').fill('40')
    await page.getByRole('button', { name: 'Save job' }).click()

    await expect(page.getByRole('heading', { name: title })).toBeVisible()

    await page.getByRole('link', { name: 'Resumes' }).click()
    await page.getByLabel('Upload resumes').setInputFiles(path.join(FILES_DIR, 'strong.pdf'))

    await expect(page.getByText('Processed 1 of 1')).toBeVisible({ timeout: 45_000 })

    await page.getByRole('link', { name: 'Candidates' }).click()
    await expect(page.getByText('Olena Kovalenko')).toBeVisible({ timeout: 30_000 })

    await page.getByRole('link', { name: 'Olena Kovalenko' }).click()
    await expect(page.getByRole('heading', { name: 'Olena Kovalenko' })).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Requirement breakdown' })).toBeVisible()

    await page.getByRole('button', { name: 'Approved' }).click()
    await expect(page.getByText('Candidate marked Approved')).toBeVisible()

    await page.getByRole('link', { name: /Back to/ }).click()
    await expect(page.getByRole('heading', { name: title })).toBeVisible()

    const downloadPromise = page.waitForEvent('download')
    await page.getByRole('button', { name: 'Export CSV' }).click()
    const download = await downloadPromise
    expect(download.suggestedFilename()).toMatch(/candidates.*\.csv$/i)

    await page.getByRole('link', { name: 'Report' }).click()
    await expect(page.getByRole('heading', { name: 'Job report' })).toBeVisible()
    await expect(page.getByText('Top candidates')).toBeVisible()

    await page.getByRole('button', { name: 'Delete' }).click()
    await page.getByRole('button', { name: 'Delete job' }).click()
    await expect(page.getByText('Job deleted')).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Jobs' })).toBeVisible()
    await expect(page.getByRole('heading', { name: title })).toHaveCount(0)
  })
})
