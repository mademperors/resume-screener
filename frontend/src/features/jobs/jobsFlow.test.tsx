import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { RouterProvider } from 'react-router-dom'
import { describe, expect, it } from 'vitest'
import { createTestRouter } from '@/app/router'

function renderApp(path: string) {
  const router = createTestRouter([path])
  render(<RouterProvider router={router} />)
  return router
}

describe('job workflows', () => {
  it('creates a job and opens its detail page', async () => {
    const user = userEvent.setup()
    const router = renderApp('/jobs/new')

    await user.type(screen.getByRole('textbox', { name: /job title/i }), 'Platform Engineer')
    await user.type(
      screen.getByRole('textbox', { name: /description/i }),
      'Own the platform and developer experience.',
    )
    await user.type(screen.getByRole('textbox', { name: /required skills/i }), 'Kubernetes{Enter}')

    const experience = screen.getByRole('spinbutton', { name: /minimum experience/i })
    await user.clear(experience)
    await user.type(experience, '4')

    await user.click(screen.getByRole('button', { name: 'Save job' }))

    expect(await screen.findByText('Job saved')).toBeInTheDocument()
    expect(await screen.findByRole('heading', { name: 'Platform Engineer' })).toBeInTheDocument()
    expect(router.state.location.pathname).toMatch(/^\/jobs\/job-/)
    expect(screen.getByText('4 years')).toBeInTheDocument()
    expect(screen.getByText('Kubernetes')).toBeInTheDocument()
  })

  it('lists the seeded jobs', async () => {
    renderApp('/')

    expect(
      await screen.findByRole('heading', { name: 'Senior Frontend Engineer' }),
    ).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Backend Engineer (Node.js)' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'QA Automation Engineer' })).toBeInTheDocument()
  })

  it('edits a job and re-evaluates candidates when requirements change', async () => {
    const user = userEvent.setup()
    renderApp('/jobs/job-1/edit')

    const experience = await screen.findByRole('spinbutton', { name: /minimum experience/i })
    await user.clear(experience)
    await user.type(experience, '6')

    await user.click(screen.getByRole('button', { name: 'Save changes' }))

    const dialog = await screen.findByRole('dialog')
    await user.click(within(dialog).getByRole('button', { name: 'Save & re-evaluate' }))

    expect(
      await screen.findByText('Job saved — uploaded candidates will be re-evaluated'),
    ).toBeInTheDocument()
    expect(
      await screen.findByRole('heading', { name: 'Senior Frontend Engineer' }),
    ).toBeInTheDocument()
    expect(screen.getByText('6 years')).toBeInTheDocument()
  })

  it('deletes a job after confirmation', async () => {
    const user = userEvent.setup()
    renderApp('/jobs/job-3')

    await screen.findByRole('heading', { name: 'QA Automation Engineer' })
    await user.click(screen.getByRole('button', { name: 'Delete' }))

    const dialog = await screen.findByRole('dialog')
    await user.click(within(dialog).getByRole('button', { name: 'Delete job' }))

    expect(await screen.findByText('Job deleted')).toBeInTheDocument()
    expect(
      await screen.findByRole('heading', { name: 'Senior Frontend Engineer' }),
    ).toBeInTheDocument()
    expect(
      screen.queryByRole('heading', { name: 'QA Automation Engineer' }),
    ).not.toBeInTheDocument()
  })
})
