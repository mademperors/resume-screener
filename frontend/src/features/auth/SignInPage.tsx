import { useEffect, useState } from 'react'
import { Navigate, useLocation, useNavigate } from 'react-router-dom'
import { FileText } from 'lucide-react'
import { ApiError } from '@/api/client'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { useAuth } from './AuthContext'
import { GoogleSignInButton } from './GoogleSignInButton'

interface SignInLocationState {
  from?: { pathname?: string }
}

export function SignInPage() {
  const { status, signIn } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)
  const mocksEnabled = import.meta.env.DEV && import.meta.env.VITE_MOCKS !== 'false'

  useEffect(() => {
    if (sessionStorage.getItem('rs_signout_reason') === 'idle') {
      setNotice('You were signed out after 30 minutes of inactivity.')
      sessionStorage.removeItem('rs_signout_reason')
    }
    if (sessionStorage.getItem('rs_signout_reason') === 'expired') {
      setNotice('Your session expired. Please sign in again.')
      sessionStorage.removeItem('rs_signout_reason')
    }
  }, [])

  if (status === 'authenticated') {
    const state = location.state as SignInLocationState | null
    return <Navigate to={state?.from?.pathname ?? '/'} replace />
  }

  const handleCredential = async (idToken: string) => {
    setError(null)
    setBusy(true)
    try {
      await signIn(idToken)
      const state = location.state as SignInLocationState | null
      navigate(state?.from?.pathname ?? '/', { replace: true })
    } catch (signInError) {
      setError(
        signInError instanceof ApiError ? signInError.message : 'Sign-in failed. Please try again.',
      )
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <Card className="w-full max-w-md">
        <CardHeader className="items-center text-center">
          <div className="mb-2 flex items-center gap-2 text-sm font-semibold">
            <FileText className="h-5 w-5" aria-hidden="true" />
            Resume Screener
          </div>
          <CardTitle>Sign in</CardTitle>
          <CardDescription>
            Use your Google account to access the recruiter workspace.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {notice ? (
            <p className="rounded-md border border-border bg-muted px-3 py-2 text-sm">{notice}</p>
          ) : null}
          {error ? <p className="text-sm text-destructive">{error}</p> : null}
          <div className="flex justify-center">
            <GoogleSignInButton onCredential={handleCredential} disabled={busy} />
          </div>
          {busy ? <p className="text-center text-sm text-muted-foreground">Signing in…</p> : null}

          {mocksEnabled ? (
            <div className="space-y-2 border-t border-border pt-4">
              <p className="text-center text-xs text-muted-foreground">
                Development mode uses an in-browser mock backend.
              </p>
              <Button
                type="button"
                variant="secondary"
                className="w-full"
                onClick={() => void handleCredential('mock-id-token')}
                disabled={busy}
              >
                Continue with demo account
              </Button>
            </div>
          ) : null}
        </CardContent>
      </Card>
    </div>
  )
}
