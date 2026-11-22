import { describe, expect, it } from 'vitest'
import { resolveApiBase } from './config'

describe('resolveApiBase', () => {
  it('falls back to /api/v1 when the value is missing or empty', () => {
    expect(resolveApiBase(undefined)).toBe('/api/v1')
    expect(resolveApiBase('')).toBe('/api/v1')
    expect(resolveApiBase('   ')).toBe('/api/v1')
  })

  it('keeps an explicit absolute API URL', () => {
    expect(resolveApiBase('http://localhost:3000/api/v1')).toBe('http://localhost:3000/api/v1')
    expect(resolveApiBase('https://example.com/api/v1/')).toBe('https://example.com/api/v1')
  })
})
