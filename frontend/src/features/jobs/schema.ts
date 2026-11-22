import { z } from 'zod'
import type { CreateJobInput, Job } from '@/types/api'

const weightSchema = (label: string) =>
  z
    .number({ error: `Enter ${label}` })
    .min(0, 'Weight must be between 0 and 10')
    .max(10, 'Weight must be between 0 and 10')

export const jobFormSchema = z.object({
  title: z
    .string()
    .trim()
    .min(1, 'Title is required')
    .max(200, 'Title must be 200 characters or fewer'),
  description: z
    .string()
    .trim()
    .min(1, 'Description is required')
    .max(20000, 'Description must be 20000 characters or fewer'),
  requiredSkills: z.array(z.string().min(1)).min(1, 'Add at least one required skill'),
  preferredSkills: z.array(z.string().min(1)),
  minExperienceYears: z
    .number({ error: 'Enter minimum experience in years' })
    .int('Experience must be a whole number')
    .min(0, 'Experience cannot be negative')
    .max(60, 'Experience must be 60 years or fewer'),
  minMatchScore: z
    .number()
    .int('Match score must be a whole number')
    .min(0, 'Match score must be between 0 and 100')
    .max(100, 'Match score must be between 0 and 100'),
  requiredSkillWeight: weightSchema('the required skill weight'),
  preferredSkillWeight: weightSchema('the preferred skill weight'),
  experienceWeight: weightSchema('the experience weight'),
  manualReviewThreshold: z
    .number({ error: 'Enter the manual review threshold' })
    .min(0, 'Threshold must be between 0 and 1')
    .max(1, 'Threshold must be between 0 and 1'),
})

export type JobFormValues = z.infer<typeof jobFormSchema>

export const emptyJobFormValues: JobFormValues = {
  title: '',
  description: '',
  requiredSkills: [],
  preferredSkills: [],
  minExperienceYears: 0,
  minMatchScore: 50,
  requiredSkillWeight: 2,
  preferredSkillWeight: 1,
  experienceWeight: 2,
  manualReviewThreshold: 0.6,
}

export function jobToFormValues(job: Job): JobFormValues {
  return {
    title: job.title,
    description: job.description,
    requiredSkills: [...job.requiredSkills],
    preferredSkills: [...job.preferredSkills],
    minExperienceYears: job.minExperienceYears,
    minMatchScore: job.minMatchScore,
    requiredSkillWeight: job.scoring.requiredSkillWeight,
    preferredSkillWeight: job.scoring.preferredSkillWeight,
    experienceWeight: job.scoring.experienceWeight,
    manualReviewThreshold: job.scoring.manualReviewThreshold,
  }
}

export type SkillWeightOverrides = Record<string, number>

export function formValuesToJobInput(
  values: JobFormValues,
  skillWeightOverrides: SkillWeightOverrides,
): CreateJobInput {
  const availableSkills = new Set([...values.requiredSkills, ...values.preferredSkills])
  const skillWeights = Object.entries(skillWeightOverrides)
    .filter(([skill]) => availableSkills.has(skill))
    .map(([skill, weight]) => ({ skill, weight }))

  return {
    title: values.title,
    description: values.description,
    requiredSkills: values.requiredSkills,
    preferredSkills: values.preferredSkills,
    minExperienceYears: values.minExperienceYears,
    minMatchScore: values.minMatchScore,
    scoring: {
      requiredSkillWeight: values.requiredSkillWeight,
      preferredSkillWeight: values.preferredSkillWeight,
      experienceWeight: values.experienceWeight,
      manualReviewThreshold: values.manualReviewThreshold,
      skillWeights,
    },
  }
}

export function skillWeightOverridesFromJob(job: Job): SkillWeightOverrides {
  return Object.fromEntries(job.scoring.skillWeights.map((entry) => [entry.skill, entry.weight]))
}
