import { toast } from 'sonner'
import { JobForm } from './JobForm'
import { createJob } from './api'

export function JobCreatePage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Create job</h1>
        <p className="text-sm text-muted-foreground">
          Define the role and screening filters used to rank resumes.
        </p>
      </div>

      <JobForm
        submitLabel="Save job"
        onSubmit={async (input) => {
          const job = await createJob(input)
          toast.success('Job saved')
          return `/jobs/${job.id}`
        }}
      />
    </div>
  )
}
