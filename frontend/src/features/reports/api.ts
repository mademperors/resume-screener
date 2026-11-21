import { apiRequest } from '@/api/client'
import type { JobReport } from '@/types/api'

export function getJobReport(jobId: string) {
  return apiRequest<JobReport>(`/jobs/${jobId}/report`)
}
