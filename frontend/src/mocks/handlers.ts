import { delay, http, HttpResponse } from 'msw'
import type { JobInput, UpdateJobInput } from '@/types/job'
import { findJob, insertJob, listJobs, removeJob, updateJobRecord } from './store'

const API = '*/api/v1'
const LATENCY_MS = 150

export const handlers = [
  http.get(`${API}/jobs`, async () => {
    await delay(LATENCY_MS)
    return HttpResponse.json(listJobs())
  }),

  http.get(`${API}/jobs/:jobId`, async ({ params }) => {
    await delay(LATENCY_MS)
    const job = findJob(String(params.jobId))
    return job
      ? HttpResponse.json(job)
      : HttpResponse.json({ message: 'Job not found' }, { status: 404 })
  }),

  http.post(`${API}/jobs`, async ({ request }) => {
    await delay(LATENCY_MS)
    const input = (await request.json()) as JobInput
    return HttpResponse.json(insertJob(input), { status: 201 })
  }),

  http.patch(`${API}/jobs/:jobId`, async ({ params, request }) => {
    await delay(LATENCY_MS)
    const input = (await request.json()) as UpdateJobInput
    const job = updateJobRecord(String(params.jobId), input)
    return job
      ? HttpResponse.json(job)
      : HttpResponse.json({ message: 'Job not found' }, { status: 404 })
  }),

  http.delete(`${API}/jobs/:jobId`, async ({ params }) => {
    await delay(LATENCY_MS)
    return removeJob(String(params.jobId))
      ? new HttpResponse(null, { status: 204 })
      : HttpResponse.json({ message: 'Job not found' }, { status: 404 })
  }),
]
