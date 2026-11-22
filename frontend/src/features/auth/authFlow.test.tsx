import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { renderApp } from '@/test/render'

describe('authentication and account', () => {
  it('redirects signed-out visitors to the sign-in page', async () => {
    renderApp('/', { authenticated: false })

    expect(await screen.findByRole('heading', { name: 'Sign in' })).toBeInTheDocument()
    expect(screen.getByText(/VITE_GOOGLE_CLIENT_ID/)).toBeInTheDocument()
  })

  it('signs out from the app shell', async () => {
    const user = userEvent.setup()
    renderApp('/')

    await screen.findByRole('heading', { name: 'Jobs' })
    await user.click(screen.getByRole('button', { name: 'Sign out' }))

    expect(await screen.findByRole('heading', { name: 'Sign in' })).toBeInTheDocument()
  })

  it('signs in with the demo account when mocks are enabled', async () => {
    const user = userEvent.setup()
    const router = renderApp('/', { authenticated: false })

    await screen.findByRole('heading', { name: 'Sign in' })
    await user.click(screen.getByRole('button', { name: 'Continue with demo account' }))

    expect(await screen.findByRole('heading', { name: 'Jobs' })).toBeInTheDocument()
    expect(router.state.location.pathname).toBe('/')
  })

  it('shows the company plan and API keys, and creates a key', async () => {
    const user = userEvent.setup()
    renderApp('/account')

    expect(await screen.findByText('Demo Company')).toBeInTheDocument()
    expect(screen.getByText('standard')).toBeInTheDocument()
    expect(await screen.findByText('Demo integration')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Create API key' }))
    await user.type(screen.getByLabelText('Name'), 'ATS integration')
    await user.click(screen.getByRole('button', { name: 'Create key' }))

    expect(await screen.findByText('New API key')).toBeInTheDocument()
    expect(screen.getByText(/^rsk_/)).toBeInTheDocument()
  })

  it('revokes an API key after confirmation', async () => {
    const user = userEvent.setup()
    renderApp('/account')

    await screen.findByText('Demo integration')
    await user.click(screen.getByRole('button', { name: 'Revoke' }))

    await user.click(await screen.findByRole('button', { name: 'Revoke key' }))

    expect(await screen.findByText('API key revoked')).toBeInTheDocument()
    await waitFor(() => expect(screen.queryByText('Demo integration')).not.toBeInTheDocument())
  })
})
