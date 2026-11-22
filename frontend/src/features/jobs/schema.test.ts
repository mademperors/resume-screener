import { describe, expect, it } from 'vitest'
import type { Job } from '@/types/api'
import {
  emptyJobFormValues,
  formValuesToJobInput,
  jobFormSchema,
  jobToFormValues,
  skillWeightOverridesFromJob,
} from './schema'

const validValues = {
  ...emptyJobFormValues,
  title: 'Frontend Engineer',
  description: 'Build the recruiter workspace.',
  requiredSkills: ['React'],
}

const job: Job = {
  id: 'job-1',
  title: 'Senior Frontend Engineer',
  description: 'Build the workspace.',
  requiredSkills: ['React', 'TypeScript'],
  preferredSkills: ['Next.js'],
  minExperienceYears: 5,
  minMatchScore: 70,
  status: 'open',
  closedAt: null,
  configVersion: 3,
  scoring: {
    requiredSkillWeight: 2,
    preferredSkillWeight: 1,
    experienceWeight: 2,
    skillWeights: [{ skill: 'React', weight: 4 }],
    manualReviewThreshold: 0.6,
  },
  createdAt: '2026-11-05T09:00:00.000Z',
  updatedAt: '2026-11-05T09:00:00.000Z',
}

describe('jobFormSchema', () => {
  it('accepts a valid job', () => {
    expect(jobFormSchema.safeParse(validValues).success).toBe(true)
  })

  it('requires a title', () => {
    const result = jobFormSchema.safeParse({ ...validValues, title: '   ' })
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.issues[0]?.message).toBe('Title is required')
    }
  })

  it('requires a description', () => {
    expect(jobFormSchema.safeParse({ ...validValues, description: '' }).success).toBe(false)
  })

  it('requires at least one required skill', () => {
    const result = jobFormSchema.safeParse({ ...validValues, requiredSkills: [] })
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.issues[0]?.message).toBe('Add at least one required skill')
    }
  })

  it('rejects negative experience', () => {
    expect(jobFormSchema.safeParse({ ...validValues, minExperienceYears: -1 }).success).toBe(false)
  })

  it('rejects an out-of-range match score', () => {
    expect(jobFormSchema.safeParse({ ...validValues, minMatchScore: 101 }).success).toBe(false)
    expect(jobFormSchema.safeParse({ ...validValues, minMatchScore: -1 }).success).toBe(false)
  })

  it('rejects weights outside 0–10 and a threshold outside 0–1', () => {
    expect(jobFormSchema.safeParse({ ...validValues, requiredSkillWeight: 11 }).success).toBe(false)
    expect(jobFormSchema.safeParse({ ...validValues, preferredSkillWeight: -1 }).success).toBe(
      false,
    )
    expect(jobFormSchema.safeParse({ ...validValues, manualReviewThreshold: 1.5 }).success).toBe(
      false,
    )
  })
})

describe('formValuesToJobInput', () => {
  it('maps form values and skill weight overrides into the API input', () => {
    const input = formValuesToJobInput(
      {
        ...validValues,
        preferredSkills: ['Next.js'],
        minExperienceYears: 3,
        minMatchScore: 75,
        requiredSkillWeight: 3,
        preferredSkillWeight: 1.5,
        experienceWeight: 2,
        manualReviewThreshold: 0.7,
      },
      { React: 4, 'Next.js': 2, Removed: 9 },
    )

    expect(input).toEqual({
      title: 'Frontend Engineer',
      description: 'Build the recruiter workspace.',
      requiredSkills: ['React'],
      preferredSkills: ['Next.js'],
      minExperienceYears: 3,
      minMatchScore: 75,
      scoring: {
        requiredSkillWeight: 3,
        preferredSkillWeight: 1.5,
        experienceWeight: 2,
        manualReviewThreshold: 0.7,
        skillWeights: [
          { skill: 'React', weight: 4 },
          { skill: 'Next.js', weight: 2 },
        ],
      },
    })
  })

  it('drops overrides for skills that are no longer part of the job', () => {
    const input = formValuesToJobInput(validValues, { Python: 9 })
    expect(input.scoring?.skillWeights).toEqual([])
  })
})

describe('jobToFormValues', () => {
  it('prefills the form and the weight overrides from a job', () => {
    const values = jobToFormValues(job)
    expect(values.minMatchScore).toBe(70)
    expect(values.requiredSkillWeight).toBe(2)
    expect(values.manualReviewThreshold).toBe(0.6)
    expect(values.requiredSkills).toEqual(['React', 'TypeScript'])
    expect(skillWeightOverridesFromJob(job)).toEqual({ React: 4 })
  })
})
