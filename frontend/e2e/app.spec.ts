import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { expect, test } from '@playwright/test'
import { openJob, signIn } from './helpers'

const FILES_DIR = fileURLToPath(
  new URL('../../backend/docs/manual-testing/files/', import.meta.url),
)

test('signs in with the demo account and lists the seeded jobs', async ({ page }) => {
  await signIn(page)

  await expect(page.getByRole('heading', { name: 'Senior Frontend Engineer' })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Backend Engineer (Node.js)' })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'QA Automation Engineer' })).toBeVisible()
})

test('creates a job with required skills and screening settings', async ({ page }) => {
  await signIn(page)
  await page.getByRole('link', { name: 'New job' }).click()

  await expect(page.getByRole('heading', { name: 'Create job' })).toBeVisible()
  await page.getByLabel(/Job title/).fill('Platform Engineer')
  await page.getByLabel(/Description/).fill('Own the platform and developer experience.')
  await page.getByLabel(/Required skills/).fill('Kubernetes')
  await page.getByLabel(/Required skills/).press('Enter')

  const experience = page.getByLabel(/Minimum experience/)
  await experience.fill('')
  await experience.fill('4')

  await page.getByText('Advanced scoring settings').click()
  await page.getByLabel('Weight for Kubernetes').fill('3')

  await page.getByRole('button', { name: 'Save job' }).click()

  await expect(page.getByRole('heading', { name: 'Platform Engineer' })).toBeVisible()
  await expect(page.getByText('Job saved')).toBeVisible()
  await expect(page.getByText('Scoring config v1')).toBeVisible()
  await expect(page.getByText('No candidates found')).toBeVisible()
})

test('closes and reopens a job', async ({ page }) => {
  await openJob(page)

  await page.getByRole('button', { name: 'Close job' }).click()
  await expect(page.getByText('Job closed')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Reopen job' })).toBeVisible()

  await page.getByRole('button', { name: 'Reopen job' }).click()
  await expect(page.getByText('Job reopened')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Close job' })).toBeVisible()
})

test('uploads a resume and shows processing progress and the new candidate', async ({ page }) => {
  await openJob(page)
  await page.getByRole('link', { name: 'Resumes' }).click()

  await expect(page.getByText('alice-johnson.pdf')).toBeVisible()

  const file = path.join(FILES_DIR, 'strong.pdf')
  await page.getByLabel('Upload resumes').setInputFiles(file)

  await expect(page.getByText('strong.pdf').first()).toBeVisible()
  await expect(page.getByText('Upload finished')).toBeVisible()

  // The mock backend processes one resume per progress poll (every 2.5 s).
  await expect(page.getByText('Processed 5 of 5')).toBeVisible({ timeout: 20_000 })

  await page.getByRole('link', { name: 'Candidates' }).click()
  await expect(page.getByText('Strong', { exact: true })).toBeVisible({ timeout: 20_000 })
})

test('filters candidates, updates a decision and exports CSV', async ({ page }) => {
  await openJob(page)

  await expect(page.getByText('Alice Johnson')).toBeVisible()
  await page.getByLabel('Decision').selectOption('Approved')
  await page.getByRole('button', { name: 'Apply filters' }).click()

  await expect(page.getByText('Alice Johnson')).toBeVisible()
  await expect(page.getByText('Bob Smith')).toHaveCount(0)

  const downloadPromise = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Export CSV' }).click()
  const download = await downloadPromise
  expect(download.suggestedFilename()).toBe('candidates-job-1.csv')

  await page.getByRole('link', { name: 'Alice Johnson' }).click()
  await expect(page.getByRole('heading', { name: 'Alice Johnson' })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Requirement breakdown' })).toBeVisible()

  await page.getByRole('button', { name: 'Rejected' }).click()
  await expect(page.getByText('Candidate marked Rejected')).toBeVisible()
})

test('shows the printable job report', async ({ page }) => {
  await openJob(page)
  await page.getByRole('link', { name: 'Report' }).click()

  await expect(page.getByRole('heading', { name: 'Job report' })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Requirement coverage' })).toBeVisible()
  await expect(page.getByText('Top candidates')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Print report' })).toBeVisible()
})
