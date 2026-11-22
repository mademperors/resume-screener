/**
 * Resolves the API base URL. An unset *or empty* VITE_API_BASE_URL (as in
 * .env.example) must fall back to the proxied /api/v1 path — using `??` here
 * would treat '' as a valid value and drop the prefix from every request.
 */
export function resolveApiBase(configured: string | undefined): string {
  const trimmed = configured?.trim()
  if (!trimmed) return '/api/v1'
  return trimmed.replace(/\/+$/, '')
}

export const API_BASE = resolveApiBase(import.meta.env.VITE_API_BASE_URL)
