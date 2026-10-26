import { apiRequest } from '@/api/client'
import type { Job, JobInput, UpdateJobInput } from '@/types/job'

export function listJobs() {
  return apiRequest<Job[]>('/jobs')
}

export function getJob(jobId: string) {
  return apiRequest<Job>(`/jobs/${jobId}`)
}

export function createJob(input: JobInput) {
  return apiRequest<Job>('/jobs', {
    method: 'POST',
    body: JSON.stringify(input),
  })
}

export function updateJob(jobId: string, input: UpdateJobInput) {
  return apiRequest<Job>(`/jobs/${jobId}`, {
    method: 'PATCH',
    body: JSON.stringify(input),
  })
}

export function deleteJob(jobId: string) {
  return apiRequest<void>(`/jobs/${jobId}`, { method: 'DELETE' })
}
