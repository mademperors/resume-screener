import { API_BASE } from '@/api/config'
import { getAccessToken, notifyAuthExpired, refreshAccessToken } from '@/features/auth/session'

interface FieldErrorPayload {
  field: string
  messages: string[]
}

interface ErrorPayload {
  statusCode?: number
  error?: string
  message?: string
  errors?: FieldErrorPayload[]
}

export class ApiError extends Error {
  status: number
  fieldErrors: Record<string, string[]>
  retryAfterSeconds?: number

  constructor(
    message: string,
    status: number,
    fieldErrors: Record<string, string[]> = {},
    retryAfterSeconds?: number,
  ) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.fieldErrors = fieldErrors
    this.retryAfterSeconds = retryAfterSeconds
  }
}

export interface ApiRequestOptions extends Omit<RequestInit, 'body' | 'headers'> {
  body?: unknown
  formData?: FormData
  headers?: Record<string, string>
  skipAuth?: boolean
  expectBlob?: boolean
}

function buildHeaders(options: ApiRequestOptions, token: string | null): Headers {
  const headers = new Headers(options.headers)

  if (options.formData) {
    // Let the browser set the multipart boundary.
  } else if (options.body !== undefined && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json')
  }

  if (!options.skipAuth && token) {
    headers.set('Authorization', `Bearer ${token}`)
  }

  return headers
}

async function parseErrorResponse(response: Response): Promise<ApiError> {
  let message = `Request failed (${response.status})`
  const fieldErrors: Record<string, string[]> = {}
  let retryAfterSeconds: number | undefined

  const retryAfter = response.headers.get('Retry-After')
  if (retryAfter && Number.isFinite(Number(retryAfter))) {
    retryAfterSeconds = Number(retryAfter)
  }

  try {
    const payload = (await response.json()) as ErrorPayload
    if (payload.message) message = payload.message
    for (const fieldError of payload.errors ?? []) {
      fieldErrors[fieldError.field] = fieldError.messages
    }
  } catch {
    // Not JSON — keep the generic message.
  }

  if (retryAfterSeconds !== undefined && response.status === 429) {
    message = `${message} Try again in ${retryAfterSeconds} seconds.`
  }

  return new ApiError(message, response.status, fieldErrors, retryAfterSeconds)
}

async function performRequest(
  path: string,
  options: ApiRequestOptions,
  isRetry: boolean,
): Promise<Response> {
  const token = options.skipAuth ? null : getAccessToken()
  const headers = buildHeaders(options, token)
  const body =
    options.formData ?? (options.body !== undefined ? JSON.stringify(options.body) : undefined)

  const response = await fetch(`${API_BASE}${path}`, {
    method: options.method,
    headers,
    body,
    signal: options.signal,
  })

  if (response.status === 401 && !options.skipAuth && !isRetry) {
    const refreshed = await refreshAccessToken()
    if (refreshed) {
      return performRequest(path, options, true)
    }
    notifyAuthExpired()
  }

  return response
}

export async function apiRequest<T>(path: string, options: ApiRequestOptions = {}): Promise<T> {
  const response = await performRequest(path, options, false)

  if (!response.ok) {
    throw await parseErrorResponse(response)
  }

  if (response.status === 204) {
    return undefined as T
  }

  return (await response.json()) as T
}

export interface DownloadResult {
  blob: Blob
  filename: string | null
}

export async function apiDownload(path: string): Promise<DownloadResult> {
  const response = await performRequest(path, { expectBlob: true }, false)

  if (!response.ok) {
    throw await parseErrorResponse(response)
  }

  const disposition = response.headers.get('Content-Disposition') ?? ''
  const match = /filename="?([^";]+)"?/i.exec(disposition)

  return { blob: await response.blob(), filename: match?.[1] ?? null }
}

/**
 * Serializes query parameters the way the backend expects: arrays are sent as
 * repeated keys (skills=a&skills=b) and empty values are omitted.
 */
export function buildQuery(params: Record<string, unknown>): string {
  const search = new URLSearchParams()

  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === '') continue

    if (Array.isArray(value)) {
      for (const item of value) {
        if (item !== undefined && item !== null && item !== '') {
          search.append(key, String(item))
        }
      }
      continue
    }

    search.set(key, String(value))
  }

  const query = search.toString()
  return query ? `?${query}` : ''
}
