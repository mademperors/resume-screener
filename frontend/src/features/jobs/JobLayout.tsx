import { useState } from 'react'
import { Link, NavLink, Outlet, useNavigate, useOutletContext, useParams } from 'react-router-dom'
import { Archive, ArchiveRestore, Pencil, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { ConfirmDialog } from '@/components/ConfirmDialog'
import { ErrorState, LoadingState } from '@/components/PageState'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { formatDate } from '@/lib/format'
import type { Job } from '@/types/api'
import { closeJob, deleteJob, reopenJob } from './api'
import { useJob } from './useJob'

export interface JobOutletContext {
  job: Job
  reloadJob: () => void
}

export function useJobContext() {
  return useOutletContext<JobOutletContext>()
}

const tabs = [
  { label: 'Candidates', to: '', end: true },
  { label: 'Resumes', to: 'resumes', end: false },
  { label: 'Report', to: 'report', end: false },
]

export function JobLayout() {
  const { jobId } = useParams<{ jobId: string }>()
  const { state, reload } = useJob(jobId)
  const navigate = useNavigate()
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [actionPending, setActionPending] = useState(false)

  if (state.status === 'loading') return <LoadingState label="Loading job…" />
  if (state.status === 'error') return <ErrorState message={state.message} />

  const job = state.job

  const handleToggleStatus = async () => {
    setActionPending(true)
    try {
      if (job.status === 'open') {
        await closeJob(job.id)
        toast.success('Job closed')
      } else {
        await reopenJob(job.id)
        toast.success('Job reopened')
      }
      reload()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Unable to update the job')
    } finally {
      setActionPending(false)
    }
  }

  const handleDelete = async () => {
    try {
      await deleteJob(job.id)
      toast.success('Job deleted')
      navigate('/')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Unable to delete the job')
    }
  }

  return (
    <div className="space-y-6">
      <div className="space-y-3">
        <Link to="/" className="text-sm text-muted-foreground hover:underline">
          ← All jobs
        </Link>

        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-2xl font-semibold tracking-tight">{job.title}</h1>
              <Badge variant={job.status === 'open' ? 'default' : 'secondary'}>
                {job.status === 'open' ? 'Open' : 'Closed'}
              </Badge>
            </div>
            <p className="text-sm text-muted-foreground">
              Min. match score {job.minMatchScore} · {job.minExperienceYears}+ years experience ·
              Scoring config v{job.configVersion} · Created {formatDate(job.createdAt)}
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            <Button asChild variant="outline" size="sm">
              <Link to={`/jobs/${job.id}/edit`}>
                <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
                Edit job
              </Link>
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleToggleStatus}
              disabled={actionPending}
            >
              {job.status === 'open' ? (
                <>
                  <Archive className="h-3.5 w-3.5" aria-hidden="true" />
                  Close job
                </>
              ) : (
                <>
                  <ArchiveRestore className="h-3.5 w-3.5" aria-hidden="true" />
                  Reopen job
                </>
              )}
            </Button>
            <Button
              type="button"
              variant="destructive"
              size="sm"
              onClick={() => setDeleteOpen(true)}
            >
              <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
              Delete
            </Button>
          </div>
        </div>
      </div>

      <nav aria-label="Job sections" className="flex gap-1 border-b border-border">
        {tabs.map((tab) => (
          <NavLink
            key={tab.label}
            to={`/jobs/${job.id}${tab.to ? `/${tab.to}` : ''}`}
            end={tab.end}
            className={({ isActive }) =>
              cn(
                '-mb-px border-b-2 px-3 py-2 text-sm transition-colors',
                isActive
                  ? 'border-primary font-medium text-foreground'
                  : 'border-transparent text-muted-foreground hover:text-foreground',
              )
            }
          >
            {tab.label}
          </NavLink>
        ))}
      </nav>

      <Outlet context={{ job, reloadJob: reload } satisfies JobOutletContext} />

      <ConfirmDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        title="Delete this job?"
        description="The job, its resumes and candidate evaluations will be permanently removed. This action cannot be undone."
        confirmLabel="Delete job"
        destructive
        onConfirm={handleDelete}
      />
    </div>
  )
}
