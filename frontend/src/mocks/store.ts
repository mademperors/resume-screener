import type {
  ApiKey,
  CandidateDetail,
  CandidateFilters,
  CandidateSummary,
  Company,
  Contacts,
  CreatedApiKey,
  CreateJobInput,
  EvaluationInfo,
  Job,
  Me,
  Progress,
  RequirementResult,
  Resume,
  ResumeStatus,
  ScoringSettings,
  UpdateJobInput,
  UpdatedJob,
  UploadResult,
} from '@/types/api'

const SEED_TIMESTAMP = '2026-11-05T09:00:00.000Z'

const DEFAULT_SCORING: ScoringSettings = {
  requiredSkillWeight: 2,
  preferredSkillWeight: 1,
  experienceWeight: 2,
  skillWeights: [],
  manualReviewThreshold: 0.6,
}

function createSeedJobs(): Job[] {
  return [
    {
      id: 'job-1',
      title: 'Senior Frontend Engineer',
      description:
        'Build and maintain the recruiter workspace: candidate tables, filters and report exports. Work closely with design to keep the interface fast and accessible.',
      requiredSkills: ['React', 'TypeScript'],
      preferredSkills: ['Next.js'],
      minExperienceYears: 5,
      minMatchScore: 70,
      status: 'open',
      closedAt: null,
      configVersion: 3,
      scoring: DEFAULT_SCORING,
      createdAt: SEED_TIMESTAMP,
      updatedAt: SEED_TIMESTAMP,
    },
    {
      id: 'job-2',
      title: 'Backend Engineer (Node.js)',
      description:
        'Design REST endpoints, async resume processing workers and integrations with the typed AI model service. Focus on reliability and data isolation between tenants.',
      requiredSkills: ['Node.js', 'PostgreSQL'],
      preferredSkills: ['Docker'],
      minExperienceYears: 3,
      minMatchScore: 60,
      status: 'open',
      closedAt: null,
      configVersion: 2,
      scoring: DEFAULT_SCORING,
      createdAt: '2026-11-07T10:00:00.000Z',
      updatedAt: '2026-11-07T10:00:00.000Z',
    },
    {
      id: 'job-3',
      title: 'QA Automation Engineer',
      description:
        'Own the test plan and automated suites for candidate scoring, upload flows and API security. Help the team keep regressions out before every release.',
      requiredSkills: ['Playwright', 'TypeScript'],
      preferredSkills: [],
      minExperienceYears: 2,
      minMatchScore: 55,
      status: 'closed',
      closedAt: '2026-11-15T16:00:00.000Z',
      configVersion: 1,
      scoring: DEFAULT_SCORING,
      createdAt: '2026-11-01T08:00:00.000Z',
      updatedAt: '2026-11-15T16:00:00.000Z',
    },
  ]
}

interface CandidateRecord {
  summary: CandidateSummary
  contacts: Contacts
  foundSkills: string[]
  missingSkills: string[]
  warningDetails: string[]
}

function createSeedResumes(): Map<string, Resume[]> {
  const map = new Map<string, Resume[]>()
  const base: Omit<Resume, 'id' | 'jobId' | 'filename' | 'sizeBytes' | 'candidateId'> = {
    status: 'Processed',
    attempts: 1,
    lastError: null,
    uploadedAt: '2026-11-10T09:00:00.000Z',
    processedAt: '2026-11-10T09:01:00.000Z',
  }

  map.set('job-1', [
    {
      ...base,
      id: 'resume-1',
      jobId: 'job-1',
      filename: 'alice-johnson.pdf',
      sizeBytes: 250_000,
      candidateId: 'candidate-1',
    },
    {
      ...base,
      id: 'resume-2',
      jobId: 'job-1',
      filename: 'bob-smith.pdf',
      sizeBytes: 198_000,
      candidateId: 'candidate-2',
    },
    {
      ...base,
      id: 'resume-3',
      jobId: 'job-1',
      filename: 'carol-diaz.docx',
      sizeBytes: 305_000,
      candidateId: 'candidate-3',
    },
    {
      ...base,
      id: 'resume-4',
      jobId: 'job-1',
      filename: 'dan-lee.pdf',
      sizeBytes: 412_000,
      candidateId: 'candidate-4',
    },
  ])

  map.set('job-2', [
    {
      id: 'resume-5',
      jobId: 'job-2',
      filename: 'scanned-cv.pdf',
      sizeBytes: 1_200_000,
      status: 'Could not read file',
      attempts: 2,
      lastError: 'No text layer found. Scanned files are not supported.',
      uploadedAt: '2026-11-12T11:00:00.000Z',
      processedAt: '2026-11-12T11:02:00.000Z',
      candidateId: null,
    },
  ])

  map.set('job-3', [])
  return map
}

function seedCandidates(): CandidateRecord[] {
  return [
    {
      summary: {
        id: 'candidate-1',
        resumeId: 'resume-1',
        name: 'Alice Johnson',
        matchScore: 91,
        experienceYears: 7,
        keySkills: ['React', 'TypeScript', 'Next.js'],
        warnings: [],
        status: 'Approved',
        belowThreshold: false,
        evaluatedAt: '2026-11-10T09:01:00.000Z',
      },
      contacts: {
        name: 'Alice Johnson',
        email: 'alice.johnson@example.com',
        phone: '+1 555 0101',
        location: 'Berlin, Germany',
      },
      foundSkills: ['React', 'TypeScript', 'Next.js'],
      missingSkills: [],
      warningDetails: [],
    },
    {
      summary: {
        id: 'candidate-2',
        resumeId: 'resume-2',
        name: 'Bob Smith',
        matchScore: 78,
        experienceYears: 6,
        keySkills: ['React', 'TypeScript'],
        warnings: ['Needs manual review'],
        status: 'Pending',
        belowThreshold: false,
        evaluatedAt: '2026-11-10T09:02:00.000Z',
      },
      contacts: {
        name: 'Bob Smith',
        email: 'bob.smith@example.com',
        phone: '+1 555 0102',
        location: 'London, UK',
      },
      foundSkills: ['React', 'TypeScript'],
      missingSkills: ['Next.js'],
      warningDetails: [
        'Confidence for the mandatory requirement “TypeScript” was below the manual review threshold.',
      ],
    },
    {
      summary: {
        id: 'candidate-3',
        resumeId: 'resume-3',
        name: 'Carol Diaz',
        matchScore: 64,
        experienceYears: 9,
        keySkills: ['React'],
        warnings: ['Does not meet requirements'],
        status: 'Pending',
        belowThreshold: true,
        evaluatedAt: '2026-11-10T09:03:00.000Z',
      },
      contacts: {
        name: 'Carol Diaz',
        email: 'carol.diaz@example.com',
        phone: '+1 555 0103',
        location: 'Madrid, Spain',
      },
      foundSkills: ['React'],
      missingSkills: ['TypeScript', 'Next.js'],
      warningDetails: ['Missing required skill: TypeScript.'],
    },
    {
      summary: {
        id: 'candidate-4',
        resumeId: 'resume-4',
        name: 'Dan Lee',
        matchScore: 40,
        experienceYears: 2,
        keySkills: ['React', 'TypeScript'],
        warnings: ['Possible manipulation', 'Does not meet requirements'],
        status: 'Rejected',
        belowThreshold: true,
        evaluatedAt: '2026-11-10T09:04:00.000Z',
      },
      contacts: {
        name: 'Dan Lee',
        email: 'dan.lee@example.com',
        phone: '+1 555 0104',
        location: 'Toronto, Canada',
      },
      foundSkills: ['React', 'TypeScript'],
      missingSkills: ['Next.js'],
      warningDetails: [
        'Hidden text was found and excluded from the evaluation.',
        'Instructions addressed to an AI model were removed from the resume.',
        'Candidate has 2 years of experience; the job requires 5.',
      ],
    },
  ]
}

function seedApiKeys(): ApiKey[] {
  return [
    {
      id: 'key-1',
      name: 'Demo integration',
      displayPrefix: 'rsk_demo1234',
      lastUsedAt: '2026-11-18T14:20:00.000Z',
      revokedAt: null,
      createdAt: '2026-11-06T09:00:00.000Z',
    },
  ]
}

let jobs = createSeedJobs()
let resumes = createSeedResumes()
let candidates = seedCandidates()
let apiKeys = seedApiKeys()

export function resetMockStore() {
  jobs = createSeedJobs()
  resumes = createSeedResumes()
  candidates = seedCandidates()
  apiKeys = seedApiKeys()
}

/* ------------------------------- Auth ---------------------------------- */

export function mockMe(): Me {
  const company: Company = {
    id: 'company-1',
    name: 'Demo Company',
    plan: 'standard',
    apiRateLimitPerMinute: 200,
    customRateLimitPerMinute: null,
  }

  return {
    id: 'user-1',
    email: 'demo@resume-screener.test',
    name: 'Demo Recruiter',
    avatarUrl: null,
    company,
  }
}

/* ------------------------------- Jobs ---------------------------------- */

export function listJobs(status?: string) {
  if (status === 'open' || status === 'closed') {
    return jobs.filter((job) => job.status === status)
  }
  return [...jobs]
}

export function findJob(id: string) {
  return jobs.find((job) => job.id === id)
}

export function insertJob(input: CreateJobInput): Job {
  const timestamp = new Date().toISOString()
  const job: Job = {
    id: `job-${crypto.randomUUID()}`,
    title: input.title,
    description: input.description,
    requiredSkills: [...input.requiredSkills],
    preferredSkills: [...input.preferredSkills],
    minExperienceYears: input.minExperienceYears,
    minMatchScore: input.minMatchScore ?? 0,
    status: 'open',
    closedAt: null,
    configVersion: 1,
    scoring: {
      ...DEFAULT_SCORING,
      ...(input.scoring ?? {}),
      skillWeights: input.scoring?.skillWeights ?? [],
    },
    createdAt: timestamp,
    updatedAt: timestamp,
  }

  jobs = [job, ...jobs]
  resumes.set(job.id, [])
  return job
}

export function updateJobRecord(id: string, input: UpdateJobInput): UpdatedJob | undefined {
  const existing = jobs.find((job) => job.id === id)
  if (!existing) return undefined

  const requirementsChanged =
    (input.requiredSkills !== undefined &&
      JSON.stringify(input.requiredSkills) !== JSON.stringify(existing.requiredSkills)) ||
    (input.preferredSkills !== undefined &&
      JSON.stringify(input.preferredSkills) !== JSON.stringify(existing.preferredSkills)) ||
    (input.minExperienceYears !== undefined &&
      input.minExperienceYears !== existing.minExperienceYears) ||
    (input.minMatchScore !== undefined && input.minMatchScore !== existing.minMatchScore) ||
    input.scoring !== undefined

  const updated: Job = {
    ...existing,
    ...(input.title !== undefined ? { title: input.title } : {}),
    ...(input.description !== undefined ? { description: input.description } : {}),
    ...(input.requiredSkills !== undefined ? { requiredSkills: [...input.requiredSkills] } : {}),
    ...(input.preferredSkills !== undefined ? { preferredSkills: [...input.preferredSkills] } : {}),
    ...(input.minExperienceYears !== undefined
      ? { minExperienceYears: input.minExperienceYears }
      : {}),
    ...(input.minMatchScore !== undefined ? { minMatchScore: input.minMatchScore } : {}),
    ...(input.scoring !== undefined
      ? {
          scoring: {
            ...existing.scoring,
            ...input.scoring,
            skillWeights: input.scoring.skillWeights ?? existing.scoring.skillWeights,
          },
        }
      : {}),
    configVersion: requirementsChanged ? existing.configVersion + 1 : existing.configVersion,
    updatedAt: new Date().toISOString(),
  }

  jobs = jobs.map((job) => (job.id === id ? updated : job))

  const jobCandidates = candidates.filter((record) => {
    const resume = findResume(record.summary.resumeId)
    return resume?.jobId === id
  })

  return { ...updated, rescoreSuggested: requirementsChanged && jobCandidates.length > 0 }
}

export function removeJob(id: string) {
  const previous = jobs.length
  jobs = jobs.filter((job) => job.id !== id)
  const jobResumes = resumes.get(id) ?? []
  for (const resume of jobResumes) {
    if (resume.candidateId) {
      candidates = candidates.filter((record) => record.summary.id !== resume.candidateId)
    }
  }
  resumes.delete(id)
  return jobs.length < previous
}

export function setJobStatus(id: string, status: Job['status']) {
  const job = jobs.find((item) => item.id === id)
  if (!job) return undefined

  const updated: Job = {
    ...job,
    status,
    closedAt: status === 'closed' ? new Date().toISOString() : null,
    updatedAt: new Date().toISOString(),
  }
  jobs = jobs.map((item) => (item.id === id ? updated : item))
  return updated
}

export function rescoreJob(id: string) {
  const jobResumes = resumes.get(id) ?? []
  let queued = 0
  for (const resume of jobResumes) {
    if (resume.candidateId) {
      const record = candidates.find((item) => item.summary.id === resume.candidateId)
      if (record) {
        record.summary.evaluatedAt = new Date().toISOString()
        queued += 1
      }
    }
  }
  return { queued }
}

/* ----------------------------- Candidates ------------------------------ */

function buildRequirements(job: Job, record: CandidateRecord): RequirementResult[] {
  const required = new Set(job.requiredSkills)
  const results: RequirementResult[] = []

  for (const skill of [...job.requiredSkills, ...job.preferredSkills]) {
    const mandatory = required.has(skill)
    const met = record.foundSkills.some((found) => found.toLowerCase() === skill.toLowerCase())
    const maxPoints = mandatory ? job.scoring.requiredSkillWeight : job.scoring.preferredSkillWeight

    results.push({
      requirementId: `skill:${skill.toLowerCase().replace(/\s+/g, '-')}`,
      label: skill,
      mandatory,
      met,
      confidence: met ? 0.92 : 0.88,
      points: met ? maxPoints : 0,
      maxPoints,
      evidence: met ? `Found “${skill}” in the resume.` : null,
    })
  }

  const experienceYears = record.summary.experienceYears ?? 0
  const experienceMet = experienceYears >= job.minExperienceYears
  results.push({
    requirementId: 'experience',
    label: 'Years of experience',
    mandatory: true,
    met: experienceMet,
    confidence: 0.8,
    points: experienceMet ? job.scoring.experienceWeight : 0,
    maxPoints: job.scoring.experienceWeight,
    evidence: `${experienceYears} years detected; the job requires ${job.minExperienceYears}.`,
  })

  return results
}

export function buildCandidateDetail(id: string): CandidateDetail | undefined {
  const record = candidates.find((item) => item.summary.id === id)
  if (!record) return undefined

  const resume = findResume(record.summary.resumeId)
  if (!resume) return undefined

  const job = findJob(resume.jobId)
  if (!job) return undefined

  const evaluation: EvaluationInfo = {
    id: `evaluation-${resume.id}`,
    configVersion: job.configVersion,
    modelName: 'MockScreeningModel',
    modelVersion: '0.1',
    evaluatedAt: record.summary.evaluatedAt,
  }

  return {
    id: record.summary.id,
    jobId: resume.jobId,
    contacts: record.contacts,
    matchScore: record.summary.matchScore,
    experienceYears: record.summary.experienceYears,
    belowThreshold: record.summary.belowThreshold,
    foundSkills: [...record.foundSkills],
    missingSkills: [...record.missingSkills],
    requirements: buildRequirements(job, record),
    warnings: [...record.summary.warnings],
    warningDetails: [...record.warningDetails],
    status: record.summary.status,
    evaluation,
    resume: {
      id: resume.id,
      filename: resume.filename,
      sizeBytes: resume.sizeBytes,
      uploadedAt: resume.uploadedAt,
    },
  }
}

function compareCandidates(a: CandidateSummary, b: CandidateSummary, field: string) {
  switch (field) {
    case 'name':
      return (a.name ?? '').localeCompare(b.name ?? '')
    case 'experience':
      return (a.experienceYears ?? -1) - (b.experienceYears ?? -1)
    case 'warnings':
      return a.warnings.length - b.warnings.length
    case 'status':
      return a.status.localeCompare(b.status)
    case 'matchScore':
    default:
      return (a.matchScore ?? -1) - (b.matchScore ?? -1)
  }
}

export function queryCandidates(jobId: string, filters: CandidateFilters) {
  const job = findJob(jobId)
  if (!job) return undefined

  const jobResumeIds = new Set((resumes.get(jobId) ?? []).map((resume) => resume.id))

  let items = candidates
    .filter((record) => jobResumeIds.has(record.summary.resumeId))
    .map((record) => record.summary)

  if (filters.skills && filters.skills.length > 0) {
    items = items.filter((candidate) =>
      filters.skills?.every((skill) =>
        candidate.keySkills.some((keySkill) => keySkill.toLowerCase() === skill.toLowerCase()),
      ),
    )
  }

  if (filters.minExperience !== undefined) {
    items = items.filter(
      (candidate) => (candidate.experienceYears ?? 0) >= (filters.minExperience as number),
    )
  }

  if (filters.minScore !== undefined) {
    items = items.filter((candidate) => (candidate.matchScore ?? 0) >= (filters.minScore as number))
  }

  if (filters.hasWarnings) {
    items = items.filter((candidate) => candidate.warnings.length > 0)
  }

  if (filters.status) {
    items = items.filter((candidate) => candidate.status === filters.status)
  }

  const sortBy = filters.sortBy ?? 'matchScore'
  const order = filters.order ?? 'desc'
  items.sort((a, b) => {
    const result = compareCandidates(a, b, sortBy)
    return order === 'asc' ? result : -result
  })

  const page = filters.page ?? 1
  const pageSize = filters.pageSize ?? 50
  const start = (page - 1) * pageSize

  return {
    items: items.slice(start, start + pageSize),
    total: items.length,
    page,
    pageSize,
    minMatchScore: job.minMatchScore,
  }
}

export function updateCandidateStatus(id: string, status: CandidateSummary['status']) {
  const record = candidates.find((item) => item.summary.id === id)
  if (!record) return undefined
  record.summary.status = status
  return buildCandidateDetail(id)
}

export function removeCandidate(id: string) {
  const record = candidates.find((item) => item.summary.id === id)
  if (!record) return false

  candidates = candidates.filter((item) => item.summary.id !== id)
  for (const list of resumes.values()) {
    for (const resume of list) {
      if (resume.candidateId === id) {
        resume.candidateId = null
      }
    }
  }
  return true
}

/* ------------------------------- Resumes ------------------------------- */

export function resumeFileLink(id: string) {
  const resume = findResume(id)
  if (!resume) return undefined
  return {
    url: `https://files.example.com/resumes/${resume.id}/${encodeURIComponent(resume.filename)}`,
    expiresAt: new Date(Date.now() + 5 * 60 * 1000).toISOString(),
  }
}

export function findResume(id: string) {
  for (const list of resumes.values()) {
    const resume = list.find((item) => item.id === id)
    if (resume) return resume
  }
  return undefined
}

export function listResumes(jobId: string, page = 1, pageSize = 50, status?: ResumeStatus) {
  const all = resumes.get(jobId) ?? []
  const filtered = status ? all.filter((resume) => resume.status === status) : all
  const start = (page - 1) * pageSize
  return {
    items: filtered.slice(start, start + pageSize),
    total: filtered.length,
    page,
    pageSize,
  }
}

export function uploadResumes(
  jobId: string,
  files: File[],
  onDuplicate: 'skip' | 'keep',
): UploadResult {
  const list = resumes.get(jobId) ?? []
  const existingNames = new Set(list.map((resume) => resume.filename))
  const results: UploadResult['results'] = []
  let accepted = 0
  let rejected = 0
  let duplicates = 0

  for (const file of files) {
    const lowerName = file.name.toLowerCase()
    const extensionOk = lowerName.endsWith('.pdf') || lowerName.endsWith('.docx')
    const sizeOk = file.size <= 10 * 1024 * 1024

    if (!extensionOk) {
      results.push({
        filename: file.name,
        status: 'rejected',
        reason: 'Only PDF and DOCX files are supported.',
      })
      rejected += 1
      continue
    }

    if (!sizeOk) {
      results.push({
        filename: file.name,
        status: 'rejected',
        reason: 'File is too large (max 10 MB).',
      })
      rejected += 1
      continue
    }

    if (existingNames.has(file.name) && onDuplicate === 'skip') {
      results.push({
        filename: file.name,
        status: 'duplicate',
        duplicateOfResumeId: list.find((resume) => resume.filename === file.name)?.id,
        reason: 'A file with this name was already uploaded.',
      })
      duplicates += 1
      continue
    }

    const id = `resume-${crypto.randomUUID()}`
    const resume: Resume = {
      id,
      jobId,
      filename: file.name,
      sizeBytes: file.size,
      status: 'Queued',
      attempts: 0,
      lastError: null,
      uploadedAt: new Date().toISOString(),
      processedAt: null,
      candidateId: null,
    }
    list.push(resume)
    existingNames.add(file.name)
    results.push({ filename: file.name, status: 'accepted', resumeId: id })
    accepted += 1
  }

  resumes.set(jobId, list)
  return { results, accepted, rejected, duplicates }
}

export function getProgress(jobId: string): Progress {
  const list = resumes.get(jobId) ?? []
  const count = (status: ResumeStatus) => list.filter((resume) => resume.status === status).length

  const queued = count('Queued')
  const processing = count('Processing')
  const processed = count('Processed')
  const processingFailed = count('Processing failed')
  const couldNotRead = count('Could not read file')
  const failed = processingFailed + couldNotRead
  const total = list.length
  const done = queued === 0 && processing === 0

  return {
    total,
    queued,
    processing,
    processed,
    failed,
    processingFailed,
    couldNotRead,
    done,
    summary: `Processed ${processed} of ${total}${failed > 0 ? `, ${failed} failed` : ''}`,
  }
}

/** Moves one queued resume through the pipeline on every progress poll. */
export function advanceQueue(jobId: string) {
  const list = resumes.get(jobId) ?? []
  const queued = list.find((resume) => resume.status === 'Queued')
  if (!queued) return

  const job = findJob(jobId)
  if (!job) return

  queued.status = 'Processed'
  queued.attempts += 1
  queued.processedAt = new Date().toISOString()

  const baseName = queued.filename.replace(/\.(pdf|docx)$/i, '').replace(/[-_]+/g, ' ')
  const displayName = baseName.replace(/\b\w/g, (char) => char.toUpperCase())
  const foundSkills = job.requiredSkills.slice(0, Math.max(1, job.requiredSkills.length - 1))
  const missingSkills = job.requiredSkills.filter((skill) => !foundSkills.includes(skill))
  const score = Math.max(25, Math.min(95, 84 - (getProgress(jobId).processed % 4) * 11))
  const warnings: CandidateSummary['warnings'] =
    missingSkills.length > 0 ? ['Does not meet requirements'] : []

  const candidateId = `candidate-${crypto.randomUUID()}`
  const summary: CandidateSummary = {
    id: candidateId,
    resumeId: queued.id,
    name: displayName || 'Unnamed candidate',
    matchScore: score,
    experienceYears: job.minExperienceYears + 1,
    keySkills: foundSkills,
    warnings,
    status: 'Pending',
    belowThreshold: score < job.minMatchScore,
    evaluatedAt: queued.processedAt,
  }

  candidates.push({
    summary,
    contacts: {
      name: summary.name,
      email: `${displayName.toLowerCase().replace(/\s+/g, '.')}@example.com`,
      phone: null,
      location: null,
    },
    foundSkills,
    missingSkills,
    warningDetails: missingSkills.map((skill) => `Missing required skill: ${skill}.`),
  })

  queued.candidateId = candidateId
}

export function retryFailed(jobId: string) {
  const list = resumes.get(jobId) ?? []
  let queued = 0

  for (const resume of list) {
    if (resume.status === 'Processing failed' || resume.status === 'Could not read file') {
      resume.status = 'Queued'
      resume.lastError = null
      queued += 1
    }
  }

  return { queued }
}

export function retryResume(id: string) {
  const resume = findResume(id)
  if (!resume) return undefined
  resume.status = 'Queued'
  resume.lastError = null
  return resume
}

/* ------------------------------- Report -------------------------------- */

export function buildReport(jobId: string) {
  const job = findJob(jobId)
  if (!job) return undefined

  const jobResumeIds = new Set((resumes.get(jobId) ?? []).map((resume) => resume.id))
  const items = candidates
    .filter((record) => jobResumeIds.has(record.summary.resumeId))
    .map((record) => record.summary)

  const evaluated = items.filter((candidate) => candidate.matchScore !== null)
  const scores = evaluated.map((candidate) => candidate.matchScore as number)
  const avg =
    scores.length > 0 ? scores.reduce((sum, score) => sum + score, 0) / scores.length : null

  const buckets = [
    { from: 0, to: 19 },
    { from: 20, to: 39 },
    { from: 40, to: 59 },
    { from: 60, to: 79 },
    { from: 80, to: 100 },
  ]

  const requirements = [...job.requiredSkills, ...job.preferredSkills].map((skill) => {
    const met = evaluated.filter((candidate) =>
      candidate.keySkills.some((keySkill) => keySkill.toLowerCase() === skill.toLowerCase()),
    ).length
    return {
      requirementId: `skill:${skill.toLowerCase().replace(/\s+/g, '-')}`,
      label: skill,
      mandatory: job.requiredSkills.includes(skill),
      met,
      share: evaluated.length > 0 ? met / evaluated.length : 0,
    }
  })

  return {
    job,
    generatedAt: new Date().toISOString(),
    processing: getProgress(jobId),
    candidates: {
      total: items.length,
      aboveThreshold: items.filter((candidate) => !candidate.belowThreshold).length,
      belowThreshold: items.filter((candidate) => candidate.belowThreshold).length,
      withWarnings: items.filter((candidate) => candidate.warnings.length > 0).length,
      averageScore: avg,
      byDecision: {
        Pending: items.filter((candidate) => candidate.status === 'Pending').length,
        Approved: items.filter((candidate) => candidate.status === 'Approved').length,
        Rejected: items.filter((candidate) => candidate.status === 'Rejected').length,
      },
      scoreDistribution: buckets.map((bucket) => ({
        ...bucket,
        count: scores.filter((score) => score >= bucket.from && score <= bucket.to).length,
      })),
    },
    requirements,
    topCandidates: evaluated
      .filter((candidate) => !candidate.belowThreshold)
      .sort((a, b) => (b.matchScore ?? 0) - (a.matchScore ?? 0))
      .slice(0, 5),
  }
}

/* ------------------------------ API keys ------------------------------- */

export function listApiKeys() {
  return [...apiKeys]
}

export function createApiKey(name: string): CreatedApiKey {
  const suffix = crypto.randomUUID().replace(/-/g, '').slice(0, 12)
  const apiKey: CreatedApiKey = {
    id: `key-${crypto.randomUUID()}`,
    name,
    displayPrefix: `rsk_${suffix.slice(0, 8)}`,
    lastUsedAt: null,
    revokedAt: null,
    createdAt: new Date().toISOString(),
    key: `rsk_${suffix}${crypto.randomUUID().replace(/-/g, '').slice(0, 12)}`,
  }
  apiKeys = [apiKey, ...apiKeys]
  return apiKey
}

export function revokeApiKey(id: string) {
  const previous = apiKeys.length
  apiKeys = apiKeys.filter((key) => key.id !== id)
  return apiKeys.length < previous
}
