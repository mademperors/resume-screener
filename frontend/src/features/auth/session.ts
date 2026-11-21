import { API_BASE } from '@/api/config'
import type { AuthTokens } from '@/types/api'

const REFRESH_TOKEN_KEY = 'rs_refresh_token'

let accessToken: string | null = null
let accessTokenExpiresAt = 0
let refreshPromise: Promise<boolean> | null = null

export function saveTokens(tokens: AuthTokens) {
  accessToken = tokens.accessToken
  accessTokenExpiresAt = Date.now() + tokens.expiresIn * 1000
  sessionStorage.setItem(REFRESH_TOKEN_KEY, tokens.refreshToken)
}

export function clearTokens() {
  accessToken = null
  accessTokenExpiresAt = 0
  sessionStorage.removeItem(REFRESH_TOKEN_KEY)
}

export function getAccessToken(): string | null {
  return accessToken
}

export function hasStoredSession(): boolean {
  return Boolean(sessionStorage.getItem(REFRESH_TOKEN_KEY))
}

export function accessTokenExpiresSoon(withinMs = 120_000): boolean {
  return accessToken !== null && Date.now() >= accessTokenExpiresAt - withinMs
}

export function notifyAuthExpired() {
  window.dispatchEvent(new CustomEvent('auth:expired'))
}

export function refreshAccessToken(): Promise<boolean> {
  if (refreshPromise) return refreshPromise

  const refreshToken = sessionStorage.getItem(REFRESH_TOKEN_KEY)
  if (!refreshToken) return Promise.resolve(false)

  refreshPromise = (async () => {
    try {
      const response = await fetch(`${API_BASE}/auth/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken }),
      })

      if (!response.ok) {
        clearTokens()
        return false
      }

      saveTokens((await response.json()) as AuthTokens)
      return true
    } catch {
      clearTokens()
      return false
    } finally {
      refreshPromise = null
    }
  })()

  return refreshPromise
}
