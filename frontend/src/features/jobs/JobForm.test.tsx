import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createMemoryRouter, RouterProvider } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
import { ApiError } from '@/api/client'
import type { Job } from '@/types/api'
import { JobForm, type JobFormProps } from './JobForm'

function renderForm(props: Partial<JobFormProps> = {}) {
  const onSubmit = vi.fn().mockResolvedValue(undefined)
  const router = createMemoryRouter(
    [
      {
        path: '/',
        element: <JobForm submitLabel="Save job" onSubmit={onSubmit} {...props} />,
      },
    ],
    { initialEntries: ['/'] },
  )

  render(<RouterProvider router={router} />)
  return { onSubmit }
}

async function fillRequiredFields(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByRole('textbox', { name: /job title/i }), 'Frontend Engineer')
  await user.type(
    screen.getByRole('textbox', { name: /description/i }),
    'Build the recruiter workspace.',
  )
  await user.type(screen.getByRole('textbox', { name: /required skills/i }), 'React{Enter}')
}

const existingJob: Job = {
  id: 'job-1',
  title: 'Senior Frontend Engineer',
  description: 'Build and maintain the recruiter workspace.',
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
    skillWeights: [],
    manualReviewThreshold: 0.6,
  },
  createdAt: '2026-10-05T09:00:00.000Z',
  updatedAt: '2026-10-05T09:00:00.000Z',
}

describe('JobForm', () => {
  it('shows validation errors, blocks saving and focuses the first invalid field', async () => {
    const user = userEvent.setup()
    const { onSubmit } = renderForm()

    await user.click(screen.getByRole('button', { name: 'Save job' }))

    expect(await screen.findByText('Title is required')).toBeInTheDocument()
    expect(screen.getByText('Description is required')).toBeInTheDocument()
    expect(screen.getByText('Add at least one required skill')).toBeInTheDocument()
    expect(onSubmit).not.toHaveBeenCalled()
    await waitFor(() => expect(document.activeElement).toHaveAttribute('id', 'title'))
  })

  it('submits skills, filters and scoring settings', async () => {
    const user = userEvent.setup()
    const { onSubmit } = renderForm()

    await fillRequiredFields(user)
    await user.type(screen.getByRole('textbox', { name: /preferred skills/i }), 'Next.js{Enter}')

    const experience = screen.getByRole('spinbutton', { name: /minimum experience/i })
    await user.clear(experience)
    await user.type(experience, '3')

    const matchScore = screen.getByRole('spinbutton', { name: 'Minimum match score value' })
    await user.clear(matchScore)
    await user.type(matchScore, '75')

    await user.click(screen.getByText('Advanced scoring settings'))
    await user.type(screen.getByLabelText('Weight for React'), '4')

    await user.click(screen.getByRole('button', { name: 'Save job' }))

    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1))
    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'Frontend Engineer',
        requiredSkills: ['React'],
        preferredSkills: ['Next.js'],
        minExperienceYears: 3,
        minMatchScore: 75,
        scoring: {
          requiredSkillWeight: 2,
          preferredSkillWeight: 1,
          experienceWeight: 2,
          manualReviewThreshold: 0.6,
          skillWeights: [{ skill: 'React', weight: 4 }],
        },
      }),
    )
  })

  it('removes a skill from the list', async () => {
    const user = userEvent.setup()
    const { onSubmit } = renderForm()

    await fillRequiredFields(user)
    await user.click(screen.getByRole('button', { name: 'Remove React' }))

    expect(screen.queryByText('React')).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Save job' }))
    expect(await screen.findByText('Add at least one required skill')).toBeInTheDocument()
    expect(onSubmit).not.toHaveBeenCalled()
  })

  it('maps backend field errors onto the form', async () => {
    const user = userEvent.setup()
    const onSubmit = vi
      .fn()
      .mockRejectedValue(new ApiError('Some fields are invalid.', 400, { title: ['Title exists'] }))
    const router = createMemoryRouter(
      [{ path: '/', element: <JobForm submitLabel="Save job" onSubmit={onSubmit} /> }],
      { initialEntries: ['/'] },
    )
    render(<RouterProvider router={router} />)

    await fillRequiredFields(user)
    await user.click(screen.getByRole('button', { name: 'Save job' }))

    expect(await screen.findByText('Title exists')).toBeInTheDocument()
  })

  it('does not prompt for re-scoring itself when editing requirements', async () => {
    const user = userEvent.setup()
    const { onSubmit } = renderForm({ initialJob: existingJob, submitLabel: 'Save changes' })

    const experience = screen.getByRole('spinbutton', { name: /minimum experience/i })
    await user.clear(experience)
    await user.type(experience, '3')

    await user.click(screen.getByRole('button', { name: 'Save changes' }))

    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1))
    expect(screen.queryByText('Re-score candidates?')).not.toBeInTheDocument()
    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ minExperienceYears: 3 }))
  })
})
