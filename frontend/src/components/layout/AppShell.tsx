import { Link, NavLink, Outlet } from 'react-router-dom'
import { FileText } from 'lucide-react'
import { Toaster } from 'sonner'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

export function AppShell() {
  return (
    <div className="flex min-h-screen flex-col">
      <header className="sticky top-0 z-40 border-b border-border bg-card/95 backdrop-blur">
        <div className="mx-auto flex h-14 w-full max-w-5xl items-center justify-between px-4">
          <div className="flex items-center gap-6">
            <Link to="/" className="flex items-center gap-2 text-sm font-semibold">
              <FileText className="h-4 w-4" aria-hidden="true" />
              Resume Screener
            </Link>
            <nav aria-label="Main navigation">
              <NavLink
                to="/"
                end
                className={({ isActive }) =>
                  cn(
                    'text-sm transition-colors hover:text-foreground',
                    isActive ? 'font-medium text-foreground' : 'text-muted-foreground',
                  )
                }
              >
                Jobs
              </NavLink>
            </nav>
          </div>
          <Button asChild size="sm">
            <Link to="/jobs/new">New job</Link>
          </Button>
        </div>
      </header>

      <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-8">
        <Outlet />
      </main>

      <footer className="border-t border-border py-4">
        <div className="mx-auto w-full max-w-5xl px-4 text-xs text-muted-foreground">
          Resume Screener — intelligent screening and ranking with typed AI models
        </div>
      </footer>

      <Toaster richColors position="top-right" />
    </div>
  )
}
