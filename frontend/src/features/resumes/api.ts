import { apiRequest, buildQuery } from '@/api/client'
import type { Progress, Resume, ResumePage, ResumeStatus, UploadResult } from '@/types/api'

export function getProgress(jobId: string) {
  return apiRequest<Progress>(`/jobs/${jobId}/progress`)
}

export function getResumes(
  jobId: string,
  params: { page?: number; pageSize?: number; status?: ResumeStatus } = {},
) {
  return apiRequest<ResumePage>(`/jobs/${jobId}/resumes${buildQuery({ ...params })}`)
}

export function uploadResumes(jobId: string, files: File[], onDuplicate: 'skip' | 'keep' = 'skip') {
  const formData = new FormData()
  for (const file of files) {
    formData.append('files', file)
  }

  return apiRequest<UploadResult>(`/jobs/${jobId}/resumes?onDuplicate=${onDuplicate}`, {
    method: 'POST',
    formData,
  })
}

export function retryResume(resumeId: string) {
  return apiRequest<Resume>(`/resumes/${resumeId}/retry`, { method: 'POST' })
}

export function retryFailedResumes(jobId: string) {
  return apiRequest<{ queued: number }>(`/jobs/${jobId}/resumes/retry-failed`, {
    method: 'POST',
  })
}
