import { useRef, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { toast } from 'sonner'
import { ConfirmDialog } from '@/components/ConfirmDialog'
import { ErrorState, LoadingState } from '@/components/PageState'
import { JobForm } from './JobForm'
import { rescoreJob, updateJob } from './api'
import { useJob } from './useJob'

export function JobEditPage() {
  const { jobId } = useParams<{ jobId: string }>()
  const { state } = useJob(jobId)
  const [rescoreOpen, setRescoreOpen] = useState(false)
  const resolverRef = useRef<((confirmed: boolean) => void) | null>(null)

  const askRescore = () =>
    new Promise<boolean>((resolve) => {
      resolverRef.current = resolve
      setRescoreOpen(true)
    })

  const settleRescore = (confirmed: boolean) => {
    setRescoreOpen(false)
    resolverRef.current?.(confirmed)
    resolverRef.current = null
  }

  return (
    <div className="space-y-6">
      <div>
        <Link
          to={jobId ? `/jobs/${jobId}` : '/'}
          className="text-sm text-muted-foreground hover:underline"
        >
          ← Back to job
        </Link>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight">Edit job</h1>
        <p className="text-sm text-muted-foreground">
          Update the role details, requirements and scoring configuration.
        </p>
      </div>

      {state.status === 'loading' ? <LoadingState label="Loading job…" /> : null}
      {state.status === 'error' ? <ErrorState message={state.message} /> : null}

      {state.status === 'ready' ? (
        <JobForm
          initialJob={state.job}
          submitLabel="Save changes"
          onSubmit={async (input) => {
            const updated = await updateJob(state.job.id, input)

            if (updated.rescoreSuggested) {
              const confirmed = await askRescore()
              if (confirmed) {
                const { queued } = await rescoreJob(state.job.id)
                toast.success(
                  `Re-scoring ${queued} candidate${queued === 1 ? '' : 's'} with the new configuration`,
                )
              }
            }

            toast.success('Job saved')
            return `/jobs/${updated.id}`
          }}
        />
      ) : null}

      <ConfirmDialog
        open={rescoreOpen}
        onOpenChange={(open) => {
          if (!open) settleRescore(false)
        }}
        title="Re-score candidates?"
        description="The job requirements changed and a new scoring configuration was created. Re-score the candidates uploaded so far with the new configuration?"
        confirmLabel="Re-score candidates"
        cancelLabel="Not now"
        onConfirm={() => settleRescore(true)}
      />
    </div>
  )
}
