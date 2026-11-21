import { createBrowserRouter, createMemoryRouter, type RouteObject } from 'react-router-dom'
import { AppShell } from '@/components/layout/AppShell'
import { JobCreatePage } from '@/features/jobs/JobCreatePage'
import { JobDetailPage } from '@/features/jobs/JobDetailPage'
import { JobEditPage } from '@/features/jobs/JobEditPage'
import { JobsListPage } from '@/features/jobs/JobsListPage'
import { NotFoundPage } from '@/features/jobs/NotFoundPage'

export const routes: RouteObject[] = [
  {
    path: '/',
    element: <AppShell />,
    children: [
      { index: true, element: <JobsListPage /> },
      { path: 'jobs/new', element: <JobCreatePage /> },
      { path: 'jobs/:jobId', element: <JobDetailPage /> },
      { path: 'jobs/:jobId/edit', element: <JobEditPage /> },
      { path: '*', element: <NotFoundPage /> },
    ],
  },
]

export function createAppRouter() {
  return createBrowserRouter(routes)
}

/** Used by tests to mount the real route tree with an in-memory history. */
export function createTestRouter(initialEntries: string[] = ['/']) {
  return createMemoryRouter(routes, { initialEntries })
}
