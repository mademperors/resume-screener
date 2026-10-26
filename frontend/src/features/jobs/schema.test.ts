import { describe, expect, it } from 'vitest'
import { emptyJobFormValues, formValuesToJobInput, jobFormSchema } from './schema'

const validValues = {
  ...emptyJobFormValues,
  title: 'Frontend Engineer',
  description: 'Build the recruiter workspace.',
  requiredSkills: ['React'],
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
    const result = jobFormSchema.safeParse({ ...validValues, description: '' })
    expect(result.success).toBe(false)
  })

  it('requires at least one required skill', () => {
    const result = jobFormSchema.safeParse({ ...validValues, requiredSkills: [] })
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.issues[0]?.message).toBe('Add at least one required skill')
    }
  })

  it('rejects negative experience', () => {
    const result = jobFormSchema.safeParse({ ...validValues, minExperienceYears: -1 })
    expect(result.success).toBe(false)
  })

  it('rejects an out-of-range match index', () => {
    expect(jobFormSchema.safeParse({ ...validValues, minMatchIndex: 101 }).success).toBe(false)
    expect(jobFormSchema.safeParse({ ...validValues, minMatchIndex: -1 }).success).toBe(false)
  })

  it('rejects mandatory skills that are not required skills', () => {
    const result = jobFormSchema.safeParse({
      ...validValues,
      mandatorySkills: ['Go'],
    })
    expect(result.success).toBe(false)
  })
})

describe('formValuesToJobInput', () => {
  it('maps form values into the API input shape', () => {
    const input = formValuesToJobInput({
      ...validValues,
      minExperienceYears: 3,
      minMatchIndex: 75,
      mandatorySkills: ['React'],
    })

    expect(input).toEqual({
      title: 'Frontend Engineer',
      description: 'Build the recruiter workspace.',
      requiredSkills: ['React'],
      desiredSkills: [],
      minExperienceYears: 3,
      filters: {
        minMatchIndex: 75,
        mandatorySkills: ['React'],
      },
    })
  })
})
