import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { renderApp } from '@/test/render'

async function fillJobBasics(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByRole('textbox', { name: /job title/i }), 'Platform Engineer')
  await user.type(
    screen.getByRole('textbox', { name: /description/i }),
    'Own the platform and developer experience.',
  )
}

describe('job workflows', () => {
  it('creates a job and opens its workspace', async () => {
    const user = userEvent.setup()
    const router = renderApp('/jobs/new')

    await screen.findByRole('heading', { name: 'Create job' })
    await fillJobBasics(user)
    await user.type(screen.getByRole('textbox', { name: /required skills/i }), 'Kubernetes{Enter}')

    const experience = screen.getByRole('spinbutton', { name: /minimum experience/i })
    await user.clear(experience)
    await user.type(experience, '4')

    await user.click(screen.getByRole('button', { name: 'Save job' }))

    expect(await screen.findByText('Job saved')).toBeInTheDocument()
    expect(await screen.findByRole('heading', { name: 'Platform Engineer' })).toBeInTheDocument()
    expect(router.state.location.pathname).toMatch(/^\/jobs\/job-/)
    expect(screen.getByText('Open')).toBeInTheDocument()
    expect(screen.getByText(/Scoring config v1/)).toBeInTheDocument()
    expect(await screen.findByText('No candidates found')).toBeInTheDocument()
  })

  it('lists the seeded jobs and filters by status', async () => {
    const user = userEvent.setup()
    renderApp('/')

    expect(
      await screen.findByRole('heading', { name: 'Senior Frontend Engineer' }),
    ).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Backend Engineer (Node.js)' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'QA Automation Engineer' })).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Closed' }))

    expect(
      await screen.findByRole('heading', { name: 'QA Automation Engineer' }),
    ).toBeInTheDocument()
    await waitFor(() =>
      expect(
        screen.queryByRole('heading', { name: 'Senior Frontend Engineer' }),
      ).not.toBeInTheDocument(),
    )
  })

  it('edits requirements and offers to re-score candidates', async () => {
    const user = userEvent.setup()
    renderApp('/jobs/job-1/edit')

    const experience = await screen.findByRole('spinbutton', { name: /minimum experience/i })
    await user.clear(experience)
    await user.type(experience, '6')

    await user.click(screen.getByRole('button', { name: 'Save changes' }))

    expect(await screen.findByText('Re-score candidates?')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Re-score candidates' }))

    expect(await screen.findByText(/Re-scoring 4 candidates/)).toBeInTheDocument()
    expect(
      await screen.findByRole('heading', { name: 'Senior Frontend Engineer' }),
    ).toBeInTheDocument()
    expect(screen.getByText(/Scoring config v4/)).toBeInTheDocument()
  })

  it('deletes a job after confirmation', async () => {
    const user = userEvent.setup()
    renderApp('/jobs/job-3')

    await screen.findByRole('heading', { name: 'QA Automation Engineer' })
    await user.click(screen.getByRole('button', { name: 'Delete' }))

    await user.click(await screen.findByRole('button', { name: 'Delete job' }))

    expect(await screen.findByText('Job deleted')).toBeInTheDocument()
    expect(await screen.findByRole('heading', { name: 'Jobs' })).toBeInTheDocument()
    expect(
      screen.queryByRole('heading', { name: 'QA Automation Engineer' }),
    ).not.toBeInTheDocument()
  })

  it('closes an open job', async () => {
    const user = userEvent.setup()
    renderApp('/jobs/job-1')

    await screen.findByRole('heading', { name: 'Senior Frontend Engineer' })
    await user.click(screen.getByRole('button', { name: 'Close job' }))

    expect(await screen.findByText('Job closed')).toBeInTheDocument()
    expect(await screen.findByRole('button', { name: 'Reopen job' })).toBeInTheDocument()
  })
})
