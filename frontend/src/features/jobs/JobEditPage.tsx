import { Link, useParams } from 'react-router-dom'
import { toast } from 'sonner'
import { ErrorState, LoadingState } from '@/components/PageState'
import { JobForm } from './JobForm'
import { updateJob } from './api'
import { useJob } from './useJob'

export function JobEditPage() {
  const { jobId } = useParams<{ jobId: string }>()
  const state = useJob(jobId)

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
          Update the role details and screening filters.
        </p>
      </div>

      {state.status === 'loading' ? <LoadingState label="Loading job…" /> : null}
      {state.status === 'error' ? <ErrorState message={state.message} /> : null}

      {state.status === 'ready' ? (
        <JobForm
          initialJob={state.job}
          submitLabel="Save changes"
          onSubmit={async (input, { reevaluateCandidates }) => {
            const updated = await updateJob(state.job.id, { ...input, reevaluateCandidates })
            toast.success(
              reevaluateCandidates
                ? 'Job saved — uploaded candidates will be re-evaluated'
                : 'Job saved',
            )
            return `/jobs/${updated.id}`
          }}
        />
      ) : null}
    </div>
  )
}
