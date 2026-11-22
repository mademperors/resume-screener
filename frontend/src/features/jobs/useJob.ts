import { useCallback, useEffect, useState } from 'react'
import type { Job } from '@/types/api'
import { getJob } from './api'

type JobState =
  { status: 'loading' } | { status: 'error'; message: string } | { status: 'ready'; job: Job }

export function useJob(jobId: string | undefined) {
  const [state, setState] = useState<JobState>({ status: 'loading' })
  const [reloadKey, setReloadKey] = useState(0)

  const reload = useCallback(() => setReloadKey((key) => key + 1), [])

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
  }, [jobId, reloadKey])

  return { state, reload }
}
