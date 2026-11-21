import { Link, NavLink, Outlet, useNavigate } from 'react-router-dom'
import { FileText, LogOut, UserRound } from 'lucide-react'
import { Toaster } from 'sonner'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { useAuth } from '@/features/auth/AuthContext'

export function AppShell() {
  const { user, signOut } = useAuth()
  const navigate = useNavigate()

  const handleSignOut = async () => {
    await signOut()
    navigate('/sign-in', { replace: true })
  }

  return (
    <div className="flex min-h-screen flex-col">
      <header className="sticky top-0 z-40 border-b border-border bg-card/95 backdrop-blur print:hidden">
        <div className="mx-auto flex h-14 w-full max-w-5xl items-center justify-between gap-3 px-4">
          <div className="flex items-center gap-6">
            <Link to="/" className="flex items-center gap-2 text-sm font-semibold">
              <FileText className="h-4 w-4" aria-hidden="true" />
              Resume Screener
            </Link>
            <nav aria-label="Main navigation" className="flex items-center gap-4">
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
              <NavLink
                to="/account"
                className={({ isActive }) =>
                  cn(
                    'text-sm transition-colors hover:text-foreground',
                    isActive ? 'font-medium text-foreground' : 'text-muted-foreground',
                  )
                }
              >
                Account
              </NavLink>
            </nav>
          </div>

          <div className="flex items-center gap-3">
            {user ? (
              <span className="hidden items-center gap-2 text-sm text-muted-foreground sm:flex">
                {user.avatarUrl ? (
                  <img
                    src={user.avatarUrl}
                    alt=""
                    className="h-6 w-6 rounded-full"
                    referrerPolicy="no-referrer"
                  />
                ) : (
                  <UserRound className="h-4 w-4" aria-hidden="true" />
                )}
                {user.name ?? user.email}
              </span>
            ) : null}
            <Button type="button" variant="outline" size="sm" onClick={handleSignOut}>
              <LogOut className="h-3.5 w-3.5" aria-hidden="true" />
              Sign out
            </Button>
            <Button asChild size="sm">
              <Link to="/jobs/new">New job</Link>
            </Button>
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-8 print:max-w-none print:p-0">
        <Outlet />
      </main>

      <footer className="border-t border-border py-4 print:hidden">
        <div className="mx-auto w-full max-w-5xl px-4 text-xs text-muted-foreground">
          Resume Screener — intelligent screening and ranking with typed AI models
        </div>
      </footer>

      <Toaster richColors position="top-right" />
    </div>
  )
}
