import { apiRequest } from '@/api/client'
import type { AuthTokens, Me } from '@/types/api'

export function signInWithGoogle(idToken: string) {
  return apiRequest<AuthTokens>('/auth/google', {
    method: 'POST',
    body: { idToken },
    skipAuth: true,
  })
}

export function fetchMe() {
  return apiRequest<Me>('/auth/me')
}

export function logout() {
  return apiRequest<void>('/auth/logout', { method: 'POST' })
}
