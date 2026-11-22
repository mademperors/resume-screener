import { apiRequest } from '@/api/client'
import type { ApiKey, CreatedApiKey } from '@/types/api'

export function listApiKeys() {
  return apiRequest<ApiKey[]>('/api-keys')
}

export function createApiKey(name: string) {
  return apiRequest<CreatedApiKey>('/api-keys', { method: 'POST', body: { name } })
}

export function revokeApiKey(id: string) {
  return apiRequest<void>(`/api-keys/${id}`, { method: 'DELETE' })
}
