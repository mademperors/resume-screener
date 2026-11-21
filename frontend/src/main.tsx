import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { RouterProvider } from 'react-router-dom'
import { createAppRouter } from '@/app/router'
import './index.css'

async function enableMocking() {
  if (!import.meta.env.DEV || import.meta.env.VITE_MOCKS === 'false') {
    return
  }

  const { worker } = await import('@/mocks/browser')
  await worker.start({ onUnhandledFrame: 'bypass' })
}

const router = createAppRouter()

enableMocking().then(() => {
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <RouterProvider router={router} />
    </StrictMode>,
  )
})
