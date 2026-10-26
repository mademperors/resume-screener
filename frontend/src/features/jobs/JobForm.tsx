import { useEffect, useRef, useState } from 'react'
import { Controller, useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { Link, useBlocker, useNavigate } from 'react-router-dom'
import { toast } from 'sonner'
import { ConfirmDialog } from '@/components/ConfirmDialog'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Slider } from '@/components/ui/slider'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'
import type { Job, JobInput } from '@/types/job'
import {
  emptyJobFormValues,
  formValuesToJobInput,
  jobFormSchema,
  jobToFormValues,
  requirementsChanged,
  type JobFormValues,
} from './schema'
import { SkillsInput } from './SkillsInput'

export interface JobFormSubmitOptions {
  reevaluateCandidates: boolean
}

export interface JobFormProps {
  initialJob?: Job
  submitLabel: string
  /** Return a path to navigate to after a successful save. */
  onSubmit: (input: JobInput, options: JobFormSubmitOptions) => Promise<string | void>
}

function FieldError({ id, message }: { id: string; message?: string }) {
  if (!message) return null
  return (
    <p id={id} className="text-sm text-destructive">
      {message}
    </p>
  )
}

export function JobForm({ initialJob, submitLabel, onSubmit }: JobFormProps) {
  const navigate = useNavigate()
  const allowLeaveRef = useRef(false)
  const [pendingValues, setPendingValues] = useState<JobFormValues | null>(null)

  const {
    control,
    register,
    handleSubmit,
    watch,
    setValue,
    formState: { errors, isDirty, isSubmitting },
  } = useForm<JobFormValues>({
    resolver: zodResolver(jobFormSchema),
    defaultValues: initialJob ? jobToFormValues(initialJob) : emptyJobFormValues,
  })

  const requiredSkills = watch('requiredSkills')
  const mandatorySkills = watch('mandatorySkills')

  // Keep mandatory skills in sync with the current required skills list.
  useEffect(() => {
    const filtered = mandatorySkills.filter((skill) => requiredSkills.includes(skill))
    if (filtered.length !== mandatorySkills.length) {
      setValue('mandatorySkills', filtered, { shouldDirty: true })
    }
  }, [mandatorySkills, requiredSkills, setValue])

  const blocker = useBlocker(
    ({ currentLocation, nextLocation }) =>
      isDirty &&
      !isSubmitting &&
      !allowLeaveRef.current &&
      currentLocation.pathname !== nextLocation.pathname,
  )

  useEffect(() => {
    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      if (isDirty) event.preventDefault()
    }
    window.addEventListener('beforeunload', handleBeforeUnload)
    return () => window.removeEventListener('beforeunload', handleBeforeUnload)
  }, [isDirty])

  const submitValues = async (values: JobFormValues, options: JobFormSubmitOptions) => {
    try {
      const redirectTo = await onSubmit(formValuesToJobInput(values), options)
      allowLeaveRef.current = true
      if (redirectTo) navigate(redirectTo)
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : 'Something went wrong. Please try again.',
      )
    }
  }

  const submit = handleSubmit(async (values) => {
    if (initialJob && requirementsChanged(initialJob, values)) {
      setPendingValues(values)
      return
    }
    await submitValues(values, { reevaluateCandidates: false })
  })

  const resolveReevaluation = (reevaluateCandidates: boolean) => {
    const values = pendingValues
    setPendingValues(null)
    if (values) void submitValues(values, { reevaluateCandidates })
  }

  const handleBlockerOpenChange = (open: boolean) => {
    if (!open && blocker.state === 'blocked') blocker.reset()
  }

  const handleLeave = () => {
    if (blocker.state === 'blocked') blocker.proceed()
  }

  const cancelTo = initialJob ? `/jobs/${initialJob.id}` : '/'

  return (
    <>
      <form onSubmit={submit} noValidate className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>Job details</CardTitle>
            <CardDescription>
              Describe the role and the skills the screening engine should look for.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="space-y-2">
              <Label htmlFor="title">
                Job title <span aria-hidden="true">*</span>
              </Label>
              <Input
                id="title"
                placeholder="e.g. Senior Frontend Engineer"
                aria-required="true"
                aria-invalid={Boolean(errors.title) || undefined}
                aria-describedby="title-error"
                {...register('title')}
              />
              <FieldError id="title-error" message={errors.title?.message} />
            </div>

            <div className="space-y-2">
              <Label htmlFor="description">
                Description <span aria-hidden="true">*</span>
              </Label>
              <Textarea
                id="description"
                rows={5}
                placeholder="Responsibilities, team context and anything the model should know about the role."
                aria-required="true"
                aria-invalid={Boolean(errors.description) || undefined}
                aria-describedby="description-error"
                {...register('description')}
              />
              <FieldError id="description-error" message={errors.description?.message} />
            </div>

            <div className="space-y-2">
              <Label htmlFor="requiredSkills">
                Required skills <span aria-hidden="true">*</span>
              </Label>
              <p className="text-sm text-muted-foreground">
                Candidates missing a required skill are flagged as not meeting the requirements.
              </p>
              <Controller
                control={control}
                name="requiredSkills"
                render={({ field }) => (
                  <SkillsInput
                    id="requiredSkills"
                    value={field.value}
                    onChange={field.onChange}
                    placeholder="e.g. TypeScript"
                    addLabel="Add required skill"
                    invalid={Boolean(errors.requiredSkills)}
                    describedBy="requiredSkills-error"
                  />
                )}
              />
              <FieldError id="requiredSkills-error" message={errors.requiredSkills?.message} />
            </div>

            <div className="space-y-2">
              <Label htmlFor="desiredSkills">Desired skills</Label>
              <p className="text-sm text-muted-foreground">
                Optional — these improve a candidate's match index but are not mandatory.
              </p>
              <Controller
                control={control}
                name="desiredSkills"
                render={({ field }) => (
                  <SkillsInput
                    id="desiredSkills"
                    value={field.value}
                    onChange={field.onChange}
                    placeholder="e.g. Next.js"
                    addLabel="Add desired skill"
                  />
                )}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="minExperienceYears">
                Minimum experience (years) <span aria-hidden="true">*</span>
              </Label>
              <Input
                id="minExperienceYears"
                type="number"
                min={0}
                max={60}
                step={1}
                className="w-32"
                aria-required="true"
                aria-invalid={Boolean(errors.minExperienceYears) || undefined}
                aria-describedby="minExperienceYears-error"
                {...register('minExperienceYears', { valueAsNumber: true })}
              />
              <FieldError
                id="minExperienceYears-error"
                message={errors.minExperienceYears?.message}
              />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Screening filters</CardTitle>
            <CardDescription>
              Configure how uploaded candidates are filtered and ranked for this job.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="space-y-3">
              <div className="flex items-center justify-between gap-4">
                <Label htmlFor="minMatchIndex">Minimum match index</Label>
                <span className="text-sm text-muted-foreground">0–100</span>
              </div>
              <Controller
                control={control}
                name="minMatchIndex"
                render={({ field }) => (
                  <div className="flex items-center gap-4">
                    <Slider
                      min={0}
                      max={100}
                      step={1}
                      value={[field.value]}
                      onValueChange={([value]) => field.onChange(value)}
                      aria-label="Minimum match index"
                      className="flex-1"
                    />
                    <Input
                      id="minMatchIndex"
                      type="number"
                      min={0}
                      max={100}
                      step={1}
                      className="w-20"
                      value={field.value}
                      onChange={(event) => {
                        const next = Number(event.target.value)
                        field.onChange(Number.isFinite(next) ? Math.min(100, Math.max(0, next)) : 0)
                      }}
                      aria-label="Minimum match index value"
                    />
                  </div>
                )}
              />
              <p className="text-sm text-muted-foreground">
                Candidates scoring below this index are marked as not matching and sorted to the
                bottom of the list.
              </p>
            </div>

            <fieldset className="space-y-3">
              <legend className="text-sm font-medium">Mandatory skills</legend>
              <p className="text-sm text-muted-foreground">
                Toggle the required skills that must be present for a candidate to qualify.
              </p>
              {requiredSkills.length === 0 ? (
                <p className="rounded-md border border-dashed border-border px-3 py-4 text-sm text-muted-foreground">
                  Add required skills first to mark them as mandatory.
                </p>
              ) : (
                <div className="space-y-2">
                  {requiredSkills.map((skill) => {
                    const checked = mandatorySkills.includes(skill)
                    return (
                      <div
                        key={skill}
                        className="flex items-center justify-between rounded-md border border-border px-3 py-2"
                      >
                        <span className="text-sm">{skill}</span>
                        <Switch
                          checked={checked}
                          onCheckedChange={(nextChecked) =>
                            setValue(
                              'mandatorySkills',
                              nextChecked
                                ? [...mandatorySkills, skill]
                                : mandatorySkills.filter((item) => item !== skill),
                              { shouldDirty: true },
                            )
                          }
                          aria-label={`Mark ${skill} as mandatory`}
                        />
                      </div>
                    )
                  })}
                </div>
              )}
              <FieldError id="mandatorySkills-error" message={errors.mandatorySkills?.message} />
            </fieldset>
          </CardContent>
        </Card>

        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" asChild>
            <Link to={cancelTo}>Cancel</Link>
          </Button>
          <Button type="submit" disabled={isSubmitting}>
            {isSubmitting ? 'Saving…' : submitLabel}
          </Button>
        </div>
      </form>

      <ConfirmDialog
        open={blocker.state === 'blocked'}
        onOpenChange={handleBlockerOpenChange}
        title="Discard unsaved changes?"
        description="You have unsaved changes. If you leave this page, they will be lost."
        confirmLabel="Leave page"
        cancelLabel="Stay"
        destructive
        onConfirm={handleLeave}
      />

      <ConfirmDialog
        open={pendingValues !== null}
        onOpenChange={(open) => {
          if (!open) setPendingValues(null)
        }}
        title="Requirements changed"
        description="The requirements of this job were updated. Re-evaluate the candidates that were already uploaded using the new requirements?"
        confirmLabel="Save & re-evaluate"
        secondaryLabel="Save without re-evaluation"
        onConfirm={() => resolveReevaluation(true)}
        onSecondary={() => resolveReevaluation(false)}
      />
    </>
  )
}
