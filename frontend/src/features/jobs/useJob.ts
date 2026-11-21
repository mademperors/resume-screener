import { useEffect, useState } from 'react'
import type { Job } from '@/types/job'
import { getJob } from './api'

type JobState =
  { status: 'loading' } | { status: 'error'; message: string } | { status: 'ready'; job: Job }

export function useJob(jobId: string | undefined) {
  const [state, setState] = useState<JobState>({ status: 'loading' })

  useEffect(() => {
    if (!jobId) {
      setState({ status: 'error', message: 'Job not found' })
      return
    }

    let active = true
    setState({ status: 'loading' })

    getJob(jobId)
      .then((job) => {
        if (active) setState({ status: 'ready', job })
      })
      .catch((error: unknown) => {
        if (active) {
          setState({
            status: 'error',
            message: error instanceof Error ? error.message : 'Unable to load the job',
          })
        }
      })

    return () => {
      active = false
    }
  }, [jobId])

  return state
}
