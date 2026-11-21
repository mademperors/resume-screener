import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import type { Me } from '@/types/api'
import { fetchMe, logout, signInWithGoogle } from './api'
import {
  accessTokenExpiresSoon,
  clearTokens,
  hasStoredSession,
  refreshAccessToken,
  saveTokens,
} from './session'
import { useIdleTimeout } from './useIdleTimeout'

export type AuthStatus = 'loading' | 'authenticated' | 'unauthenticated'

interface AuthContextValue {
  user: Me | null
  status: AuthStatus
  signIn: (idToken: string) => Promise<void>
  signOut: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<Me | null>(null)
  const [status, setStatus] = useState<AuthStatus>('loading')

  const loadProfile = useCallback(async () => {
    const me = await fetchMe()
    setUser(me)
    setStatus('authenticated')
  }, [])

  useEffect(() => {
    let active = true

    const bootstrap = async () => {
      if (!hasStoredSession()) {
        if (active) setStatus('unauthenticated')
        return
      }

      const refreshed = await refreshAccessToken()
      if (!active) return

      if (!refreshed) {
        setStatus('unauthenticated')
        return
      }

      try {
        await loadProfile()
      } catch {
        if (active) setStatus('unauthenticated')
      }
    }

    void bootstrap()

    const handleExpired = () => {
      clearTokens()
      setUser(null)
      setStatus('unauthenticated')
    }

    window.addEventListener('auth:expired', handleExpired)
    return () => {
      active = false
      window.removeEventListener('auth:expired', handleExpired)
    }
  }, [loadProfile])

  useEffect(() => {
    if (status !== 'authenticated') return

    const interval = window.setInterval(() => {
      if (accessTokenExpiresSoon()) void refreshAccessToken()
    }, 60_000)

    return () => window.clearInterval(interval)
  }, [status])

  const signIn = useCallback(
    async (idToken: string) => {
      const tokens = await signInWithGoogle(idToken)
      saveTokens(tokens)
      await loadProfile()
    },
    [loadProfile],
  )

  const signOut = useCallback(async () => {
    try {
      await logout()
    } catch {
      // The session may already be gone; clear the client state either way.
    }
    clearTokens()
    setUser(null)
    setStatus('unauthenticated')
  }, [])

  useIdleTimeout(status === 'authenticated', () => {
    sessionStorage.setItem('rs_signout_reason', 'idle')
    clearTokens()
    setUser(null)
    setStatus('unauthenticated')
    window.dispatchEvent(new CustomEvent('auth:expired'))
  })

  const value = useMemo(() => ({ user, status, signIn, signOut }), [user, status, signIn, signOut])

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (!context) throw new Error('useAuth must be used inside AuthProvider')
  return context
}
