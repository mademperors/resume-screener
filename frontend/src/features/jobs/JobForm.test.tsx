import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createMemoryRouter, RouterProvider } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
import type { Job } from '@/types/job'
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
  desiredSkills: ['Next.js'],
  minExperienceYears: 5,
  filters: {
    minMatchIndex: 70,
    mandatorySkills: ['React'],
  },
  createdAt: '2026-10-05T09:00:00.000Z',
  updatedAt: '2026-10-05T09:00:00.000Z',
}

describe('JobForm', () => {
  it('shows validation errors and blocks saving when required fields are empty', async () => {
    const user = userEvent.setup()
    const { onSubmit } = renderForm()

    await user.click(screen.getByRole('button', { name: 'Save job' }))

    expect(await screen.findByText('Title is required')).toBeInTheDocument()
    expect(screen.getByText('Description is required')).toBeInTheDocument()
    expect(screen.getByText('Add at least one required skill')).toBeInTheDocument()
    expect(onSubmit).not.toHaveBeenCalled()
  })

  it('submits skills, experience and screening filters', async () => {
    const user = userEvent.setup()
    const { onSubmit } = renderForm()

    await fillRequiredFields(user)

    const experience = screen.getByRole('spinbutton', { name: /minimum experience/i })
    await user.clear(experience)
    await user.type(experience, '3')

    await user.click(screen.getByRole('switch', { name: 'Mark React as mandatory' }))

    const matchIndex = screen.getByRole('spinbutton', { name: 'Minimum match index value' })
    await user.clear(matchIndex)
    await user.type(matchIndex, '75')

    await user.click(screen.getByRole('button', { name: 'Save job' }))

    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1))
    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'Frontend Engineer',
        requiredSkills: ['React'],
        minExperienceYears: 3,
        filters: {
          minMatchIndex: 75,
          mandatorySkills: ['React'],
        },
      }),
      { reevaluateCandidates: false },
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

  it('offers re-evaluation when requirements change in edit mode', async () => {
    const user = userEvent.setup()
    const { onSubmit } = renderForm({ initialJob: existingJob, submitLabel: 'Save changes' })

    const experience = screen.getByRole('spinbutton', { name: /minimum experience/i })
    await user.clear(experience)
    await user.type(experience, '3')

    await user.click(screen.getByRole('button', { name: 'Save changes' }))

    expect(await screen.findByText('Requirements changed')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Save & re-evaluate' }))

    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1))
    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ minExperienceYears: 3 }), {
      reevaluateCandidates: true,
    })
  })

  it('can save edited requirements without re-evaluating', async () => {
    const user = userEvent.setup()
    const { onSubmit } = renderForm({ initialJob: existingJob, submitLabel: 'Save changes' })

    const experience = screen.getByRole('spinbutton', { name: /minimum experience/i })
    await user.clear(experience)
    await user.type(experience, '4')

    await user.click(screen.getByRole('button', { name: 'Save changes' }))
    await screen.findByText('Requirements changed')

    await user.click(screen.getByRole('button', { name: 'Save without re-evaluation' }))

    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1))
    expect(onSubmit).toHaveBeenCalledWith(expect.anything(), {
      reevaluateCandidates: false,
    })
  })

  it('does not prompt for re-evaluation when only the title changed', async () => {
    const user = userEvent.setup()
    const { onSubmit } = renderForm({ initialJob: existingJob, submitLabel: 'Save changes' })

    const title = screen.getByRole('textbox', { name: /job title/i })
    await user.clear(title)
    await user.type(title, 'Staff Frontend Engineer')

    await user.click(screen.getByRole('button', { name: 'Save changes' }))

    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1))
    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'Staff Frontend Engineer' }),
      { reevaluateCandidates: false },
    )
  })
})
