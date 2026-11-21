import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { expect, test } from '@playwright/test'

/**
 * Backend integration test. Requires the backend running on :3000 and an API
 * key seeded in its database:
 *
 *   $env:BACKEND_API_KEY = 'rsk_...'
 *   npm run test:e2e -- e2e/backend-api.spec.ts
 *
 * These endpoints accept API keys (only auth and /api-keys are session-only),
 * so the test does not need Google sign-in.
 */

const API_KEY = process.env.BACKEND_API_KEY ?? ''
const API = process.env.BACKEND_API_URL ?? 'http://localhost:3000/api/v1'
const FILES_DIR = fileURLToPath(
  new URL('../../backend/docs/manual-testing/files/', import.meta.url),
)

const auth = { 'X-API-Key': API_KEY }

interface UploadFile {
  name: string
  mimeType: string
  buffer: Buffer
}

async function uploadFiles(jobId: string, files: UploadFile[]) {
  const form = new FormData()
  for (const item of files) {
    form.append('files', new Blob([item.buffer], { type: item.mimeType }), item.name)
  }

  const response = await fetch(`${API}/jobs/${jobId}/resumes`, {
    method: 'POST',
    headers: auth,
    body: form,
  })

  return { status: response.status, body: (await response.json()) as unknown }
}

test.describe('backend integration (API key)', () => {
  test.skip(!API_KEY, 'Set BACKEND_API_KEY to run against a real backend')

  test('health, job, upload, processing, ranking, export, report, cleanup', async ({ request }) => {
    const health = await request.get(`${API}/health`, { headers: auth })
    expect(health.ok()).toBeTruthy()

    const unique = Date.now()
    const created = await request.post(`${API}/jobs`, {
      headers: auth,
      data: {
        title: `E2E Platform Engineer ${unique}`,
        description: 'Job created by the Playwright backend integration suite.',
        requiredSkills: ['TypeScript', 'React'],
        preferredSkills: ['Next.js'],
        minExperienceYears: 3,
        minMatchScore: 50,
      },
    })
    expect(created.status()).toBe(201)
    const job = (await created.json()) as { id: string }
    expect(job.id).toBeTruthy()

    try {
      const file = (name: string) => ({
        name,
        mimeType: name.endsWith('.pdf')
          ? 'application/pdf'
          : 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        buffer: fs.readFileSync(path.join(FILES_DIR, name)),
      })

      const upload = await uploadFiles(job.id, [
        file('strong.pdf'),
        file('weak.pdf'),
        file('hidden.pdf'),
      ])
      expect(upload.status).toBe(202)
      const uploadBody = upload.body as { accepted: number; rejected: number }
      expect(uploadBody.accepted).toBe(3)
      expect(uploadBody.rejected).toBe(0)

      // A duplicate is detected unless keep is requested.
      const duplicate = await uploadFiles(job.id, [file('strong.pdf')])
      const duplicateBody = duplicate.body as { duplicates: number }
      expect(duplicateBody.duplicates).toBe(1)

      await expect
        .poll(
          async () => {
            const response = await request.get(`${API}/jobs/${job.id}/progress`, {
              headers: auth,
            })
            const progress = (await response.json()) as { done: boolean }
            return progress.done
          },
          { timeout: 90_000, intervals: [1000, 2000] },
        )
        .toBe(true)

      const listResponse = await request.get(`${API}/jobs/${job.id}/candidates`, {
        headers: auth,
      })
      expect(listResponse.ok()).toBeTruthy()
      const list = (await listResponse.json()) as {
        items: Array<{ id: string; matchScore: number | null }>
        total: number
      }
      expect(list.total).toBeGreaterThanOrEqual(2)
      expect(list.items[0]?.matchScore).not.toBeNull()

      const detailResponse = await request.get(`${API}/candidates/${list.items[0]?.id}`, {
        headers: auth,
      })
      expect(detailResponse.ok()).toBeTruthy()
      const detail = (await detailResponse.json()) as {
        requirements: unknown[]
        evaluation: { modelName: string } | null
      }
      expect(detail.requirements.length).toBeGreaterThan(0)
      expect(detail.evaluation?.modelName).toBeTruthy()

      const csv = await request.get(`${API}/jobs/${job.id}/candidates/export.csv`, {
        headers: auth,
      })
      expect(csv.headers()['content-type']).toContain('text/csv')
      const csvText = await csv.text()
      expect(csvText).toContain('Rank,Name')
      expect(csvText).toContain('Match score')

      const reportResponse = await request.get(`${API}/jobs/${job.id}/report`, {
        headers: auth,
      })
      expect(reportResponse.ok()).toBeTruthy()
      const report = (await reportResponse.json()) as {
        job: { id: string }
        candidates: { total: number }
        requirements: unknown[]
      }
      expect(report.job.id).toBe(job.id)
      expect(report.candidates.total).toBeGreaterThanOrEqual(2)
      expect(report.requirements.length).toBeGreaterThan(0)

      const statusResponse = await request.patch(`${API}/candidates/${list.items[0]?.id}/status`, {
        headers: auth,
        data: { status: 'Approved' },
      })
      expect(statusResponse.ok()).toBeTruthy()
    } finally {
      const deleted = await request.delete(`${API}/jobs/${job.id}`, { headers: auth })
      expect(deleted.status()).toBe(204)
    }
  })
})
