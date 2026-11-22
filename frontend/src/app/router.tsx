import { createBrowserRouter, createMemoryRouter, type RouteObject } from 'react-router-dom'
import { AppShell } from '@/components/layout/AppShell'
import { AccountPage } from '@/features/account/AccountPage'
import { CandidatePage } from '@/features/candidates/CandidatePage'
import { JobCandidatesPage } from '@/features/candidates/JobCandidatesPage'
import { ProtectedRoute } from '@/features/auth/ProtectedRoute'
import { SignInPage } from '@/features/auth/SignInPage'
import { JobCreatePage } from '@/features/jobs/JobCreatePage'
import { JobEditPage } from '@/features/jobs/JobEditPage'
import { JobLayout } from '@/features/jobs/JobLayout'
import { JobsListPage } from '@/features/jobs/JobsListPage'
import { NotFoundPage } from '@/features/jobs/NotFoundPage'
import { JobReportPage } from '@/features/reports/JobReportPage'
import { JobResumesPage } from '@/features/resumes/JobResumesPage'

export const routes: RouteObject[] = [
  { path: '/sign-in', element: <SignInPage /> },
  {
    element: <ProtectedRoute />,
    children: [
      {
        path: '/',
        element: <AppShell />,
        children: [
          { index: true, element: <JobsListPage /> },
          { path: 'jobs/new', element: <JobCreatePage /> },
          {
            path: 'jobs/:jobId',
            element: <JobLayout />,
            children: [
              { index: true, element: <JobCandidatesPage /> },
              { path: 'resumes', element: <JobResumesPage /> },
              { path: 'report', element: <JobReportPage /> },
            ],
          },
          { path: 'jobs/:jobId/edit', element: <JobEditPage /> },
          { path: 'jobs/:jobId/candidates/:candidateId', element: <CandidatePage /> },
          { path: 'account', element: <AccountPage /> },
          { path: '*', element: <NotFoundPage /> },
        ],
      },
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
