import type { Job, JobInput } from '@/types/job'

const SEED_TIMESTAMP = '2026-10-05T09:00:00.000Z'

function createSeedJobs(): Job[] {
  return [
    {
      id: 'job-1',
      title: 'Senior Frontend Engineer',
      description:
        'Build and maintain the recruiter workspace: candidate tables, filters and report exports. Work closely with design to keep the interface fast and accessible.',
      requiredSkills: ['React', 'TypeScript', 'CSS'],
      desiredSkills: ['Next.js', 'Testing Library'],
      minExperienceYears: 5,
      filters: {
        minMatchIndex: 70,
        mandatorySkills: ['React'],
      },
      createdAt: SEED_TIMESTAMP,
      updatedAt: SEED_TIMESTAMP,
    },
    {
      id: 'job-2',
      title: 'Backend Engineer (Node.js)',
      description:
        'Design REST endpoints, async resume processing workers and integrations with the typed AI model service. Focus on reliability and data isolation between tenants.',
      requiredSkills: ['Node.js', 'PostgreSQL', 'REST'],
      desiredSkills: ['Docker', 'Redis'],
      minExperienceYears: 3,
      filters: {
        minMatchIndex: 60,
        mandatorySkills: ['Node.js'],
      },
      createdAt: SEED_TIMESTAMP,
      updatedAt: SEED_TIMESTAMP,
    },
    {
      id: 'job-3',
      title: 'QA Automation Engineer',
      description:
        'Own the test plan and automated suites for candidate scoring, upload flows and API security. Help the team keep regressions out before every release.',
      requiredSkills: ['Playwright', 'TypeScript', 'CI'],
      desiredSkills: ['k6'],
      minExperienceYears: 2,
      filters: {
        minMatchIndex: 55,
        mandatorySkills: [],
      },
      createdAt: SEED_TIMESTAMP,
      updatedAt: SEED_TIMESTAMP,
    },
  ]
}

let jobs: Job[] = createSeedJobs()

export function resetJobStore() {
  jobs = createSeedJobs()
}

export function listJobs() {
  return [...jobs]
}

export function findJob(id: string) {
  return jobs.find((job) => job.id === id)
}

function toStoredJob(input: JobInput, id: string, createdAt: string): Job {
  return {
    id,
    title: input.title,
    description: input.description,
    requiredSkills: [...input.requiredSkills],
    desiredSkills: [...input.desiredSkills],
    minExperienceYears: input.minExperienceYears,
    filters: {
      minMatchIndex: input.filters.minMatchIndex,
      mandatorySkills: [...input.filters.mandatorySkills],
    },
    createdAt,
    updatedAt: new Date().toISOString(),
  }
}

export function insertJob(input: JobInput) {
  const job = toStoredJob(input, `job-${crypto.randomUUID()}`, new Date().toISOString())
  jobs = [job, ...jobs]
  return job
}

export function updateJobRecord(id: string, input: JobInput) {
  const existing = jobs.find((job) => job.id === id)
  if (!existing) return undefined

  const updated = toStoredJob(input, existing.id, existing.createdAt)
  jobs = jobs.map((job) => (job.id === id ? updated : job))
  return updated
}

export function removeJob(id: string) {
  const previousLength = jobs.length
  jobs = jobs.filter((job) => job.id !== id)
  return jobs.length < previousLength
}
