import { apiRequest } from '@/api/client'
import type { CreateJobInput, Job, JobStatus, UpdateJobInput, UpdatedJob } from '@/types/api'

export function listJobs(status?: JobStatus) {
  const query = status ? `?status=${status}` : ''
  return apiRequest<Job[]>(`/jobs${query}`)
}

export function getJob(jobId: string) {
  return apiRequest<Job>(`/jobs/${jobId}`)
}

export function createJob(input: CreateJobInput) {
  return apiRequest<Job>('/jobs', { method: 'POST', body: input })
}

export function updateJob(jobId: string, input: UpdateJobInput) {
  return apiRequest<UpdatedJob>(`/jobs/${jobId}`, { method: 'PATCH', body: input })
}

export function deleteJob(jobId: string) {
  return apiRequest<void>(`/jobs/${jobId}`, { method: 'DELETE' })
}

export function closeJob(jobId: string) {
  return apiRequest<Job>(`/jobs/${jobId}/close`, { method: 'POST' })
}

export function reopenJob(jobId: string) {
  return apiRequest<Job>(`/jobs/${jobId}/reopen`, { method: 'POST' })
}

export function rescoreJob(jobId: string) {
  return apiRequest<{ queued: number }>(`/jobs/${jobId}/rescore`, { method: 'POST' })
}
