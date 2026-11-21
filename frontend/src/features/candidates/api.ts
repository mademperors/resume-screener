import { apiDownload, apiRequest, buildQuery } from '@/api/client'
import type {
  CandidateDetail,
  CandidateFilters,
  CandidatePage,
  CandidateStatus,
  DownloadLink,
} from '@/types/api'

export function getCandidates(jobId: string, filters: CandidateFilters = {}) {
  return apiRequest<CandidatePage>(`/jobs/${jobId}/candidates${buildQuery({ ...filters })}`)
}

export function getCandidate(candidateId: string) {
  return apiRequest<CandidateDetail>(`/candidates/${candidateId}`)
}

export function updateCandidateStatus(candidateId: string, status: CandidateStatus) {
  return apiRequest<CandidateDetail>(`/candidates/${candidateId}/status`, {
    method: 'PATCH',
    body: { status },
  })
}

export function deleteCandidate(candidateId: string) {
  return apiRequest<void>(`/candidates/${candidateId}`, { method: 'DELETE' })
}

export function getResumeFileLink(candidateId: string) {
  return apiRequest<DownloadLink>(`/candidates/${candidateId}/resume-file`)
}

export function exportCandidatesCsv(jobId: string, filters: CandidateFilters = {}) {
  const { page: _page, pageSize: _pageSize, ...exportFilters } = filters
  return apiDownload(
    `/jobs/${jobId}/candidates/export.csv${buildQuery(exportFilters as Record<string, unknown>)}`,
  )
}
