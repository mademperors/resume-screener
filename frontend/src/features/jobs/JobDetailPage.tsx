import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { toast } from 'sonner'
import { ConfirmDialog } from '@/components/ConfirmDialog'
import { ErrorState, LoadingState } from '@/components/PageState'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { deleteJob } from './api'
import { useJob } from './useJob'

const dateFormatter = new Intl.DateTimeFormat('en-GB', { dateStyle: 'medium' })

export function JobDetailPage() {
  const { jobId } = useParams<{ jobId: string }>()
  const state = useJob(jobId)
  const navigate = useNavigate()
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [deleting, setDeleting] = useState(false)

  const handleDelete = async () => {
    if (state.status !== 'ready') return

    setDeleting(true)
    try {
      await deleteJob(state.job.id)
      toast.success('Job deleted')
      navigate('/')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Unable to delete the job')
      setDeleting(false)
      setDeleteOpen(false)
    }
  }

  return (
    <div className="space-y-6">
      <Link to="/" className="text-sm text-muted-foreground hover:underline">
        ← All jobs
      </Link>

      {state.status === 'loading' ? <LoadingState label="Loading job…" /> : null}
      {state.status === 'error' ? <ErrorState message={state.message} /> : null}

      {state.status === 'ready' ? (
        <>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="space-y-1">
              <h1 className="text-2xl font-semibold tracking-tight">{state.job.title}</h1>
              <p className="text-sm text-muted-foreground">
                Created {dateFormatter.format(new Date(state.job.createdAt))} · Updated{' '}
                {dateFormatter.format(new Date(state.job.updatedAt))}
              </p>
            </div>
            <div className="flex gap-2">
              <Button asChild variant="outline">
                <Link to={`/jobs/${state.job.id}/edit`}>Edit job</Link>
              </Button>
              <Button
                type="button"
                variant="destructive"
                onClick={() => setDeleteOpen(true)}
                disabled={deleting}
              >
                Delete
              </Button>
            </div>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Description</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="whitespace-pre-line text-sm">{state.job.description}</p>
            </CardContent>
          </Card>

          <div className="grid gap-4 md:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>Skills</CardTitle>
                <CardDescription>Skills used to evaluate candidate profiles.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <p className="text-sm font-medium">Required</p>
                  {state.job.requiredSkills.length > 0 ? (
                    <ul className="flex flex-wrap gap-1.5" aria-label="Required skills">
                      {state.job.requiredSkills.map((skill) => (
                        <li key={skill}>
                          <Badge variant="secondary">{skill}</Badge>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-sm text-muted-foreground">None</p>
                  )}
                </div>
                <div className="space-y-2">
                  <p className="text-sm font-medium">Desired</p>
                  {state.job.desiredSkills.length > 0 ? (
                    <ul className="flex flex-wrap gap-1.5" aria-label="Desired skills">
                      {state.job.desiredSkills.map((skill) => (
                        <li key={skill}>
                          <Badge variant="outline">{skill}</Badge>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-sm text-muted-foreground">None</p>
                  )}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Screening filters</CardTitle>
                <CardDescription>How candidates are filtered and ranked.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Minimum match index</span>
                  <span className="font-medium">{state.job.filters.minMatchIndex}</span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Minimum experience</span>
                  <span className="font-medium">{state.job.minExperienceYears} years</span>
                </div>
                <div className="space-y-2">
                  <p className="text-sm text-muted-foreground">Mandatory skills</p>
                  {state.job.filters.mandatorySkills.length > 0 ? (
                    <ul className="flex flex-wrap gap-1.5" aria-label="Mandatory skills">
                      {state.job.filters.mandatorySkills.map((skill) => (
                        <li key={skill}>
                          <Badge>{skill}</Badge>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-sm">None</p>
                  )}
                </div>
              </CardContent>
            </Card>
          </div>

          <ConfirmDialog
            open={deleteOpen}
            onOpenChange={setDeleteOpen}
            title="Delete this job?"
            description="The job and its screening configuration will be permanently removed. This action cannot be undone."
            confirmLabel="Delete job"
            destructive
            onConfirm={handleDelete}
          />
        </>
      ) : null}
    </div>
  )
}
