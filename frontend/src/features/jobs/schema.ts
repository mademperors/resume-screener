import { z } from 'zod'
import type { Job, JobInput } from '@/types/job'

export const jobFormSchema = z
  .object({
    title: z
      .string()
      .trim()
      .min(1, 'Title is required')
      .max(120, 'Title must be 120 characters or fewer'),
    description: z.string().trim().min(1, 'Description is required'),
    requiredSkills: z.array(z.string().min(1)).min(1, 'Add at least one required skill'),
    desiredSkills: z.array(z.string().min(1)),
    minExperienceYears: z
      .number({ error: 'Enter minimum experience in years' })
      .int('Experience must be a whole number')
      .min(0, 'Experience cannot be negative')
      .max(60, 'Experience must be 60 years or fewer'),
    minMatchIndex: z
      .number()
      .int('Match index must be a whole number')
      .min(0, 'Match index must be between 0 and 100')
      .max(100, 'Match index must be between 0 and 100'),
    mandatorySkills: z.array(z.string().min(1)),
  })
  .superRefine((values, context) => {
    const invalid = values.mandatorySkills.find((skill) => !values.requiredSkills.includes(skill))
    if (invalid) {
      context.addIssue({
        code: 'custom',
        path: ['mandatorySkills'],
        message: 'Mandatory skills must be chosen from required skills',
      })
    }
  })

export type JobFormValues = z.infer<typeof jobFormSchema>

export const emptyJobFormValues: JobFormValues = {
  title: '',
  description: '',
  requiredSkills: [],
  desiredSkills: [],
  minExperienceYears: 0,
  minMatchIndex: 50,
  mandatorySkills: [],
}

export function jobToFormValues(job: Job): JobFormValues {
  return {
    title: job.title,
    description: job.description,
    requiredSkills: [...job.requiredSkills],
    desiredSkills: [...job.desiredSkills],
    minExperienceYears: job.minExperienceYears,
    minMatchIndex: job.filters.minMatchIndex,
    mandatorySkills: [...job.filters.mandatorySkills],
  }
}

export function formValuesToJobInput(values: JobFormValues): JobInput {
  return {
    title: values.title,
    description: values.description,
    requiredSkills: values.requiredSkills,
    desiredSkills: values.desiredSkills,
    minExperienceYears: values.minExperienceYears,
    filters: {
      minMatchIndex: values.minMatchIndex,
      mandatorySkills: values.mandatorySkills,
    },
  }
}

function sameSkillSet(left: string[], right: string[]) {
  if (left.length !== right.length) return false
  const normalized = new Set(right.map((skill) => skill.toLowerCase()))
  return left.every((skill) => normalized.has(skill.toLowerCase()))
}

/** FR 2.3.3 — the recruiter changed requirements that affect candidate scoring. */
export function requirementsChanged(job: Job, values: JobFormValues) {
  return (
    job.minExperienceYears !== values.minExperienceYears ||
    job.filters.minMatchIndex !== values.minMatchIndex ||
    !sameSkillSet(job.requiredSkills, values.requiredSkills) ||
    !sameSkillSet(job.desiredSkills, values.desiredSkills) ||
    !sameSkillSet(job.filters.mandatorySkills, values.mandatorySkills)
  )
}
