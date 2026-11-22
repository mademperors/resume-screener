import { render } from '@testing-library/react'
import { RouterProvider } from 'react-router-dom'
import { createTestRouter } from '@/app/router'
import { AuthProvider } from '@/features/auth/AuthContext'

export function renderApp(initialPath = '/', { authenticated = true } = {}) {
  if (authenticated) {
    sessionStorage.setItem('rs_refresh_token', 'mock-refresh-token')
  }

  const router = createTestRouter([initialPath])
  render(
    <AuthProvider>
      <RouterProvider router={router} />
    </AuthProvider>,
  )

  return router
}
