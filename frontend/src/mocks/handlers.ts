import { delay, http, HttpResponse } from 'msw'
import type {
  CandidateFilters,
  CandidateSortField,
  CandidateStatus,
  CreateJobInput,
  ResumeStatus,
  UpdateJobInput,
} from '@/types/api'
import * as store from './store'

const API = '*/api/v1'
const LATENCY_MS = 80

function notFound(message = 'Not found') {
  return HttpResponse.json({ statusCode: 404, error: 'Not Found', message }, { status: 404 })
}

function makeTokens() {
  return {
    tokenType: 'Bearer' as const,
    accessToken: `mock-access-${crypto.randomUUID()}`,
    expiresIn: 900,
    refreshToken: `mock-refresh-${crypto.randomUUID()}`,
  }
}

function numberParam(url: URL, name: string) {
  const raw = url.searchParams.get(name)
  if (raw === null || raw === '') return undefined
  const value = Number(raw)
  return Number.isFinite(value) ? value : undefined
}

const sortFields: CandidateSortField[] = ['matchScore', 'name', 'experience', 'warnings', 'status']
const candidateStatuses: CandidateStatus[] = ['Pending', 'Approved', 'Rejected']
const resumeStatuses: ResumeStatus[] = [
  'Queued',
  'Processing',
  'Processed',
  'Processing failed',
  'Could not read file',
]

function parseCandidateFilters(url: URL, paginate = true): CandidateFilters {
  const skills = url.searchParams
    .getAll('skills')
    .flatMap((value) => value.split(','))
    .map((value) => value.trim())
    .filter(Boolean)

  const statusParam = url.searchParams.get('status')
  const status = candidateStatuses.find((value) => value === statusParam)
  const sortParam = url.searchParams.get('sortBy')
  const sortBy = sortFields.find((value) => value === sortParam) ?? 'matchScore'
  const order = url.searchParams.get('order') === 'asc' ? 'asc' : 'desc'

  return {
    skills,
    minExperience: numberParam(url, 'minExperience'),
    minScore: numberParam(url, 'minScore'),
    hasWarnings: url.searchParams.get('hasWarnings') === 'true',
    status,
    sortBy,
    order,
    page: paginate ? (numberParam(url, 'page') ?? 1) : 1,
    pageSize: paginate ? (numberParam(url, 'pageSize') ?? 50) : 1000,
  }
}

function csvEscape(value: string | number) {
  const text = String(value)
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text
}

export const handlers = [
  /* ------------------------------- Auth -------------------------------- */
  http.post(`${API}/auth/google`, async () => {
    await delay(LATENCY_MS)
    return HttpResponse.json(makeTokens())
  }),

  http.post(`${API}/auth/refresh`, async () => {
    await delay(LATENCY_MS)
    return HttpResponse.json(makeTokens())
  }),

  http.post(`${API}/auth/logout`, async () => {
    await delay(LATENCY_MS)
    return new HttpResponse(null, { status: 204 })
  }),

  http.get(`${API}/auth/me`, async () => {
    await delay(LATENCY_MS)
    return HttpResponse.json(store.mockMe())
  }),

  /* ------------------------------- Jobs -------------------------------- */
  http.get(`${API}/jobs`, async ({ request }) => {
    await delay(LATENCY_MS)
    const status = new URL(request.url).searchParams.get('status') ?? undefined
    return HttpResponse.json(store.listJobs(status))
  }),

  http.post(`${API}/jobs`, async ({ request }) => {
    await delay(LATENCY_MS)
    const input = (await request.json()) as CreateJobInput
    return HttpResponse.json(store.insertJob(input), { status: 201 })
  }),

  http.get(`${API}/jobs/:jobId`, async ({ params }) => {
    await delay(LATENCY_MS)
    const job = store.findJob(String(params.jobId))
    return job ? HttpResponse.json(job) : notFound('Job not found')
  }),

  http.patch(`${API}/jobs/:jobId`, async ({ params, request }) => {
    await delay(LATENCY_MS)
    const input = (await request.json()) as UpdateJobInput
    const job = store.updateJobRecord(String(params.jobId), input)
    return job ? HttpResponse.json(job) : notFound('Job not found')
  }),

  http.delete(`${API}/jobs/:jobId`, async ({ params }) => {
    await delay(LATENCY_MS)
    return store.removeJob(String(params.jobId))
      ? new HttpResponse(null, { status: 204 })
      : notFound('Job not found')
  }),

  http.post(`${API}/jobs/:jobId/close`, async ({ params }) => {
    await delay(LATENCY_MS)
    const job = store.setJobStatus(String(params.jobId), 'closed')
    return job ? HttpResponse.json(job) : notFound('Job not found')
  }),

  http.post(`${API}/jobs/:jobId/reopen`, async ({ params }) => {
    await delay(LATENCY_MS)
    const job = store.setJobStatus(String(params.jobId), 'open')
    return job ? HttpResponse.json(job) : notFound('Job not found')
  }),

  http.post(`${API}/jobs/:jobId/rescore`, async ({ params }) => {
    await delay(LATENCY_MS)
    const jobId = String(params.jobId)
    if (!store.findJob(jobId)) return notFound('Job not found')
    return HttpResponse.json(store.rescoreJob(jobId), { status: 202 })
  }),

  /* ------------------------------ Resumes ------------------------------ */
  http.post(`${API}/jobs/:jobId/resumes`, async ({ params, request }) => {
    await delay(LATENCY_MS)
    const jobId = String(params.jobId)
    if (!store.findJob(jobId)) return notFound('Job not found')

    const formData = await request.formData()
    const files = formData.getAll('files').filter((value): value is File => {
      // In Node, FormData yields undici File objects; duck-typing avoids
      // cross-realm instanceof mismatches with jsdom's File in tests.
      return (
        typeof value === 'object' &&
        value !== null &&
        'name' in value &&
        'size' in value &&
        typeof (value as File).name === 'string'
      )
    })
    const onDuplicate =
      new URL(request.url).searchParams.get('onDuplicate') === 'keep' ? 'keep' : 'skip'

    return HttpResponse.json(store.uploadResumes(jobId, files, onDuplicate), { status: 202 })
  }),

  http.get(`${API}/jobs/:jobId/resumes`, async ({ params, request }) => {
    await delay(LATENCY_MS)
    const jobId = String(params.jobId)
    if (!store.findJob(jobId)) return notFound('Job not found')

    const url = new URL(request.url)
    const statusParam = url.searchParams.get('status')
    const status = resumeStatuses.find((value) => value === statusParam)

    return HttpResponse.json(
      store.listResumes(
        jobId,
        numberParam(url, 'page') ?? 1,
        numberParam(url, 'pageSize') ?? 50,
        status,
      ),
    )
  }),

  http.post(`${API}/jobs/:jobId/resumes/retry-failed`, async ({ params }) => {
    await delay(LATENCY_MS)
    const jobId = String(params.jobId)
    if (!store.findJob(jobId)) return notFound('Job not found')
    return HttpResponse.json(store.retryFailed(jobId), { status: 202 })
  }),

  http.get(`${API}/jobs/:jobId/progress`, async ({ params }) => {
    await delay(LATENCY_MS)
    const jobId = String(params.jobId)
    if (!store.findJob(jobId)) return notFound('Job not found')

    store.advanceQueue(jobId)
    return HttpResponse.json(store.getProgress(jobId))
  }),

  http.post(`${API}/resumes/:resumeId/retry`, async ({ params }) => {
    await delay(LATENCY_MS)
    const resume = store.retryResume(String(params.resumeId))
    return resume ? HttpResponse.json(resume, { status: 202 }) : notFound('Resume not found')
  }),

  /* ----------------------------- Candidates ---------------------------- */
  http.get(`${API}/jobs/:jobId/candidates/export.csv`, async ({ params, request }) => {
    await delay(LATENCY_MS)
    const jobId = String(params.jobId)
    if (!store.findJob(jobId)) return notFound('Job not found')

    const page = store.queryCandidates(jobId, parseCandidateFilters(new URL(request.url), false))
    if (!page) return notFound('Job not found')

    const header = 'Name,Match score,Experience (years),Key skills,Warnings,Status\n'
    const rows = page.items.map((candidate) =>
      [
        candidate.name ?? '',
        candidate.matchScore ?? '',
        candidate.experienceYears ?? '',
        candidate.keySkills.join('; '),
        candidate.warnings.join('; '),
        candidate.status,
      ]
        .map(csvEscape)
        .join(','),
    )

    return new HttpResponse(header + rows.join('\n'), {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="candidates-${jobId}.csv"`,
      },
    })
  }),

  http.get(`${API}/jobs/:jobId/candidates`, async ({ params, request }) => {
    await delay(LATENCY_MS)
    const jobId = String(params.jobId)
    const page = store.queryCandidates(jobId, parseCandidateFilters(new URL(request.url)))
    return page ? HttpResponse.json(page) : notFound('Job not found')
  }),

  http.get(`${API}/candidates/:candidateId`, async ({ params }) => {
    await delay(LATENCY_MS)
    const candidate = store.buildCandidateDetail(String(params.candidateId))
    return candidate ? HttpResponse.json(candidate) : notFound('Candidate not found')
  }),

  http.patch(`${API}/candidates/:candidateId/status`, async ({ params, request }) => {
    await delay(LATENCY_MS)
    const body = (await request.json()) as { status?: CandidateStatus }
    const status = candidateStatuses.find((value) => value === body.status)
    if (!status) {
      return HttpResponse.json(
        {
          statusCode: 400,
          error: 'Bad Request',
          message: 'Invalid status.',
          errors: [{ field: 'status', messages: ['Choose Pending, Approved or Rejected.'] }],
        },
        { status: 400 },
      )
    }

    const candidate = store.updateCandidateStatus(String(params.candidateId), status)
    return candidate ? HttpResponse.json(candidate) : notFound('Candidate not found')
  }),

  http.delete(`${API}/candidates/:candidateId`, async ({ params }) => {
    await delay(LATENCY_MS)
    return store.removeCandidate(String(params.candidateId))
      ? new HttpResponse(null, { status: 204 })
      : notFound('Candidate not found')
  }),

  http.get(`${API}/candidates/:candidateId/resume-file`, async ({ params }) => {
    await delay(LATENCY_MS)
    const candidate = store.buildCandidateDetail(String(params.candidateId))
    if (!candidate) return notFound('Candidate not found')
    const link = store.resumeFileLink(candidate.resume.id)
    return link ? HttpResponse.json(link) : notFound('Resume not found')
  }),

  /* ------------------------------- Report ------------------------------ */
  http.get(`${API}/jobs/:jobId/report`, async ({ params }) => {
    await delay(LATENCY_MS)
    const report = store.buildReport(String(params.jobId))
    return report ? HttpResponse.json(report) : notFound('Job not found')
  }),

  /* ------------------------------ API keys ----------------------------- */
  http.get(`${API}/api-keys`, async () => {
    await delay(LATENCY_MS)
    return HttpResponse.json(store.listApiKeys())
  }),

  http.post(`${API}/api-keys`, async ({ request }) => {
    await delay(LATENCY_MS)
    const body = (await request.json()) as { name?: string }
    if (!body.name?.trim()) {
      return HttpResponse.json(
        {
          statusCode: 400,
          error: 'Bad Request',
          message: 'Enter a name for the API key.',
          errors: [{ field: 'name', messages: ['Name is required.'] }],
        },
        { status: 400 },
      )
    }
    return HttpResponse.json(store.createApiKey(body.name.trim()), { status: 201 })
  }),

  http.delete(`${API}/api-keys/:keyId`, async ({ params }) => {
    await delay(LATENCY_MS)
    return store.revokeApiKey(String(params.keyId))
      ? new HttpResponse(null, { status: 204 })
      : notFound('API key not found')
  }),
]
