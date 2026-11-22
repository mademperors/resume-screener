import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowRight } from 'lucide-react'
import { ErrorState, LoadingState } from '@/components/PageState'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { formatDate } from '@/lib/format'
import { cn } from '@/lib/utils'
import type { Job, JobStatus } from '@/types/api'
import { listJobs } from './api'

type Filter = 'all' | JobStatus

type ListState =
  { status: 'loading' } | { status: 'error'; message: string } | { status: 'ready'; jobs: Job[] }

const filters: Array<{ value: Filter; label: string }> = [
  { value: 'all', label: 'All' },
  { value: 'open', label: 'Open' },
  { value: 'closed', label: 'Closed' },
]

export function JobsListPage() {
  const [filter, setFilter] = useState<Filter>('all')
  const [state, setState] = useState<ListState>({ status: 'loading' })
  const [reloadKey, setReloadKey] = useState(0)

  useEffect(() => {
    let active = true
    setState({ status: 'loading' })

    listJobs(filter === 'all' ? undefined : filter)
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
  }, [filter, reloadKey])

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Jobs</h1>
          <p className="text-sm text-muted-foreground">
            Create a job, upload resumes and review ranked candidates.
          </p>
        </div>
        <Button asChild>
          <Link to="/jobs/new">Create job</Link>
        </Button>
      </div>

      <div className="flex gap-1" role="group" aria-label="Filter jobs by status">
        {filters.map((option) => (
          <Button
            key={option.value}
            type="button"
            size="sm"
            variant={filter === option.value ? 'default' : 'outline'}
            onClick={() => setFilter(option.value)}
            aria-pressed={filter === option.value}
          >
            {option.label}
          </Button>
        ))}
      </div>

      {state.status === 'loading' ? <LoadingState label="Loading jobs…" /> : null}

      {state.status === 'error' ? (
        <ErrorState message={state.message} onRetry={() => setReloadKey((key) => key + 1)} />
      ) : null}

      {state.status === 'ready' && state.jobs.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-start gap-3 pt-6">
            <h2 className="text-lg font-semibold">
              {filter === 'all' ? 'No jobs yet' : `No ${filter} jobs`}
            </h2>
            <p className="text-sm text-muted-foreground">
              {filter === 'all'
                ? 'Create your first job to start uploading and ranking resumes.'
                : 'Try another status filter or create a new job.'}
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
            <Card key={job.id} className={cn(job.status === 'closed' && 'opacity-80')}>
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
                  <div className="flex flex-wrap gap-1.5">
                    <Badge variant={job.status === 'open' ? 'default' : 'secondary'}>
                      {job.status === 'open' ? 'Open' : 'Closed'}
                    </Badge>
                    <Badge variant="outline">Match score ≥ {job.minMatchScore}</Badge>
                  </div>
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
                    {job.minExperienceYears}+ years experience · Scoring config v{job.configVersion}{' '}
                    · Updated {formatDate(job.updatedAt)}
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
