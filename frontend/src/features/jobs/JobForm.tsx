import { useEffect, useRef, useState } from 'react'
import { Controller, useForm, type FieldErrors } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { Link, useBlocker, useNavigate } from 'react-router-dom'
import { toast } from 'sonner'
import { ConfirmDialog } from '@/components/ConfirmDialog'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Slider } from '@/components/ui/slider'
import { Textarea } from '@/components/ui/textarea'
import { applyApiFieldErrors } from '@/lib/form-errors'
import type { CreateJobInput, Job } from '@/types/api'
import {
  emptyJobFormValues,
  formValuesToJobInput,
  jobFormSchema,
  jobToFormValues,
  skillWeightOverridesFromJob,
  type JobFormValues,
  type SkillWeightOverrides,
} from './schema'
import { SkillsInput } from './SkillsInput'

export interface JobFormProps {
  initialJob?: Job
  submitLabel: string
  /** Return a path to navigate to after a successful save. */
  onSubmit: (input: CreateJobInput) => Promise<string | void>
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
  const [skillOverrides, setSkillOverrides] = useState<SkillWeightOverrides>(() =>
    initialJob ? skillWeightOverridesFromJob(initialJob) : {},
  )

  const {
    control,
    register,
    handleSubmit,
    watch,
    setError,
    formState: { errors, isDirty, isSubmitting },
  } = useForm<JobFormValues>({
    resolver: zodResolver(jobFormSchema),
    defaultValues: initialJob ? jobToFormValues(initialJob) : emptyJobFormValues,
  })

  const requiredSkills = watch('requiredSkills')
  const preferredSkills = watch('preferredSkills')
  const allSkills = [...requiredSkills, ...preferredSkills]

  // Drop weight overrides for skills that are no longer part of the job.
  useEffect(() => {
    const available = new Set([...requiredSkills, ...preferredSkills])
    setSkillOverrides((current) => {
      const filtered = Object.entries(current).filter(([skill]) => available.has(skill))
      return filtered.length === Object.keys(current).length
        ? current
        : Object.fromEntries(filtered)
    })
  }, [requiredSkills, preferredSkills])

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

  const submit = handleSubmit(async (values) => {
    try {
      const redirectTo = await onSubmit(formValuesToJobInput(values, skillOverrides))
      allowLeaveRef.current = true
      if (redirectTo) navigate(redirectTo)
    } catch (error) {
      const message = applyApiFieldErrors(error, setError)
      if (message) toast.error(message)
    }
  }, focusFirstInvalid)

  const handleBlockerOpenChange = (open: boolean) => {
    if (!open && blocker.state === 'blocked') blocker.reset()
  }

  const handleLeave = () => {
    if (blocker.state === 'blocked') blocker.proceed()
  }

  const cancelTo = initialJob ? `/jobs/${initialJob.id}` : '/'

  // On a failed submit, move focus to the first invalid field so its error is
  // announced instead of an invisible live region.
  function focusFirstInvalid(formErrors: FieldErrors<JobFormValues>) {
    const firstField = Object.keys(formErrors)[0]
    if (!firstField) return
    document.getElementById(firstField)?.focus()
  }

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
                required
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
                required
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
                Mandatory skills — a candidate without one is marked “Does not meet requirements”.
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
              <Label htmlFor="preferredSkills">Preferred skills</Label>
              <p className="text-sm text-muted-foreground">
                Optional — these improve a candidate’s score but are not mandatory.
              </p>
              <Controller
                control={control}
                name="preferredSkills"
                render={({ field }) => (
                  <SkillsInput
                    id="preferredSkills"
                    value={field.value}
                    onChange={field.onChange}
                    placeholder="e.g. Next.js"
                    addLabel="Add preferred skill"
                  />
                )}
              />
            </div>

            <div className="grid gap-5 sm:grid-cols-2">
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
                  required
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

              <div className="space-y-2">
                <div className="flex items-center justify-between gap-4">
                  <Label htmlFor="minMatchScore">Minimum match score</Label>
                  <span className="text-sm text-muted-foreground">0–100</span>
                </div>
                <Controller
                  control={control}
                  name="minMatchScore"
                  render={({ field }) => (
                    <div className="flex items-center gap-4">
                      <Slider
                        min={0}
                        max={100}
                        step={1}
                        value={[field.value]}
                        onValueChange={([value]) => field.onChange(value)}
                        aria-label="Minimum match score"
                        className="flex-1"
                      />
                      <Input
                        id="minMatchScore"
                        type="number"
                        min={0}
                        max={100}
                        step={1}
                        className="w-20"
                        value={field.value}
                        onChange={(event) => {
                          const next = Number(event.target.value)
                          field.onChange(
                            Number.isFinite(next) ? Math.min(100, Math.max(0, next)) : 0,
                          )
                        }}
                        aria-label="Minimum match score value"
                      />
                    </div>
                  )}
                />
              </div>
            </div>
            <p className="text-sm text-muted-foreground">
              Candidates scoring below the minimum match score are shown in a separate “Below
              threshold” section at the bottom of the list.
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Screening filters</CardTitle>
            <CardDescription>
              Required skills are always mandatory. Fine-tune how requirements are weighted below.
            </CardDescription>
            <ul className="mt-2 space-y-1 text-sm text-muted-foreground">
              <li>
                Candidate must have all {requiredSkills.length || 0} required skill
                {requiredSkills.length === 1 ? '' : 's'}.
              </li>
              <li>Preferred skills improve the score but are never mandatory.</li>
              <li>
                Changing requirements creates a new scoring configuration version; you can re-score
                uploaded candidates afterwards.
              </li>
            </ul>
          </CardHeader>
          <CardContent>
            <details className="group rounded-md border border-border">
              <summary className="cursor-pointer select-none px-3 py-3 text-sm font-medium">
                Advanced scoring settings
              </summary>
              <div className="space-y-5 border-t border-border px-3 py-4">
                <div className="grid gap-4 sm:grid-cols-3">
                  <div className="space-y-2">
                    <Label htmlFor="requiredSkillWeight">Required skill weight</Label>
                    <Input
                      id="requiredSkillWeight"
                      type="number"
                      min={0}
                      max={10}
                      step={0.5}
                      aria-invalid={Boolean(errors.requiredSkillWeight) || undefined}
                      {...register('requiredSkillWeight', { valueAsNumber: true })}
                    />
                    <FieldError
                      id="requiredSkillWeight-error"
                      message={errors.requiredSkillWeight?.message}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="preferredSkillWeight">Preferred skill weight</Label>
                    <Input
                      id="preferredSkillWeight"
                      type="number"
                      min={0}
                      max={10}
                      step={0.5}
                      aria-invalid={Boolean(errors.preferredSkillWeight) || undefined}
                      {...register('preferredSkillWeight', { valueAsNumber: true })}
                    />
                    <FieldError
                      id="preferredSkillWeight-error"
                      message={errors.preferredSkillWeight?.message}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="experienceWeight">Experience weight</Label>
                    <Input
                      id="experienceWeight"
                      type="number"
                      min={0}
                      max={10}
                      step={0.5}
                      aria-invalid={Boolean(errors.experienceWeight) || undefined}
                      {...register('experienceWeight', { valueAsNumber: true })}
                    />
                    <FieldError
                      id="experienceWeight-error"
                      message={errors.experienceWeight?.message}
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="manualReviewThreshold">Manual review threshold (0–1)</Label>
                  <p className="text-sm text-muted-foreground">
                    When the model’s confidence on a mandatory requirement is below this value, the
                    candidate is marked “Needs manual review”.
                  </p>
                  <Input
                    id="manualReviewThreshold"
                    type="number"
                    min={0}
                    max={1}
                    step={0.05}
                    className="w-32"
                    aria-invalid={Boolean(errors.manualReviewThreshold) || undefined}
                    {...register('manualReviewThreshold', { valueAsNumber: true })}
                  />
                  <FieldError
                    id="manualReviewThreshold-error"
                    message={errors.manualReviewThreshold?.message}
                  />
                </div>

                <div className="space-y-2">
                  <p className="text-sm font-medium">Per-skill weight overrides</p>
                  <p className="text-sm text-muted-foreground">
                    Optional. Leave blank to use the weight of the skill’s kind (required or
                    preferred).
                  </p>
                  {allSkills.length === 0 ? (
                    <p className="rounded-md border border-dashed border-border px-3 py-4 text-sm text-muted-foreground">
                      Add required or preferred skills to override their weights.
                    </p>
                  ) : (
                    <div className="space-y-2">
                      {allSkills.map((skill) => (
                        <div
                          key={skill}
                          className="flex items-center justify-between gap-4 rounded-md border border-border px-3 py-2"
                        >
                          <span className="text-sm">
                            {skill}
                            <span className="ml-2 text-xs text-muted-foreground">
                              {requiredSkills.includes(skill) ? 'required' : 'preferred'}
                            </span>
                          </span>
                          <Input
                            type="number"
                            min={0}
                            max={10}
                            step={0.5}
                            className="w-24"
                            aria-label={`Weight for ${skill}`}
                            value={skillOverrides[skill] ?? ''}
                            onChange={(event) => {
                              const raw = event.target.value
                              setSkillOverrides((current) => {
                                const next = { ...current }
                                if (raw === '') {
                                  delete next[skill]
                                } else {
                                  const parsed = Number(raw)
                                  next[skill] = Number.isFinite(parsed)
                                    ? Math.min(10, Math.max(0, parsed))
                                    : 0
                                }
                                return next
                              })
                            }}
                          />
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </details>
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
    </>
  )
}
