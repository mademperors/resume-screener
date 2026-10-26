import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowRight } from 'lucide-react'
import { ErrorState, LoadingState } from '@/components/PageState'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import type { Job } from '@/types/job'
import { listJobs } from './api'

type ListState =
  { status: 'loading' } | { status: 'error'; message: string } | { status: 'ready'; jobs: Job[] }

export function JobsListPage() {
  const [state, setState] = useState<ListState>({ status: 'loading' })
  const [reloadKey, setReloadKey] = useState(0)

  useEffect(() => {
    let active = true
    setState({ status: 'loading' })

    listJobs()
      .then((jobs) => {
        if (active) setState({ status: 'ready', jobs })
      })
      .catch((error: unknown) => {
        if (active) {
          setState({
            status: 'error',
            message: error instanceof Error ? error.message : 'Unable to load jobs',
          })
        }
      })

    return () => {
      active = false
    }
  }, [reloadKey])

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Jobs</h1>
          <p className="text-sm text-muted-foreground">
            Create a job and configure screening filters for incoming resumes.
          </p>
        </div>
        <Button asChild>
          <Link to="/jobs/new">Create job</Link>
        </Button>
      </div>

      {state.status === 'loading' ? <LoadingState label="Loading jobs…" /> : null}

      {state.status === 'error' ? (
        <ErrorState message={state.message} onRetry={() => setReloadKey((key) => key + 1)} />
      ) : null}

      {state.status === 'ready' && state.jobs.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-start gap-3 pt-6">
            <h2 className="text-lg font-semibold">No jobs yet</h2>
            <p className="text-sm text-muted-foreground">
              Create your first job to start uploading and ranking resumes.
            </p>
            <Button asChild size="sm">
              <Link to="/jobs/new">Create job</Link>
            </Button>
          </CardContent>
        </Card>
      ) : null}

      {state.status === 'ready' && state.jobs.length > 0 ? (
        <div className="grid gap-4">
          {state.jobs.map((job) => (
            <Card key={job.id}>
              <CardHeader>
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="space-y-1">
                    <CardTitle>
                      <Link to={`/jobs/${job.id}`} className="hover:underline">
                        {job.title}
                      </Link>
                    </CardTitle>
                    <CardDescription className="line-clamp-2">{job.description}</CardDescription>
                  </div>
                  <Badge variant="outline">Match index ≥ {job.filters.minMatchIndex}</Badge>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                <ul className="flex flex-wrap gap-1.5" aria-label="Required skills">
                  {job.requiredSkills.map((skill) => (
                    <li key={skill}>
                      <Badge variant="secondary">{skill}</Badge>
                    </li>
                  ))}
                </ul>
                <div className="flex flex-wrap items-center justify-between gap-2 text-sm text-muted-foreground">
                  <span>
                    {job.minExperienceYears}+ years experience ·{' '}
                    {job.filters.mandatorySkills.length} mandatory skill
                    {job.filters.mandatorySkills.length === 1 ? '' : 's'}
                  </span>
                  <Link
                    to={`/jobs/${job.id}`}
                    className="inline-flex items-center gap-1 font-medium text-foreground hover:underline"
                  >
                    Open job <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
                  </Link>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : null}
    </div>
  )
}
