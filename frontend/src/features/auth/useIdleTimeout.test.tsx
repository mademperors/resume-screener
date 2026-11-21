import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { IDLE_TIMEOUT_MS, useIdleTimeout } from './useIdleTimeout'

describe('useIdleTimeout', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('calls onIdle after the full idle period', () => {
    const onIdle = vi.fn()
    renderHook(() => useIdleTimeout(true, onIdle))

    act(() => {
      vi.advanceTimersByTime(IDLE_TIMEOUT_MS - 1)
    })
    expect(onIdle).not.toHaveBeenCalled()

    act(() => {
      vi.advanceTimersByTime(1)
    })
    expect(onIdle).toHaveBeenCalledTimes(1)
  })

  it('resets the timer on user activity', () => {
    const onIdle = vi.fn()
    renderHook(() => useIdleTimeout(true, onIdle))

    act(() => {
      vi.advanceTimersByTime(IDLE_TIMEOUT_MS / 2)
    })
    act(() => {
      window.dispatchEvent(new Event('keydown'))
    })
    act(() => {
      vi.advanceTimersByTime(IDLE_TIMEOUT_MS / 2)
    })
    expect(onIdle).not.toHaveBeenCalled()

    act(() => {
      vi.advanceTimersByTime(IDLE_TIMEOUT_MS / 2 + 1)
    })
    expect(onIdle).toHaveBeenCalledTimes(1)
  })

  it('does nothing while disabled', () => {
    const onIdle = vi.fn()
    renderHook(() => useIdleTimeout(false, onIdle))

    act(() => {
      vi.advanceTimersByTime(IDLE_TIMEOUT_MS * 2)
    })
    expect(onIdle).not.toHaveBeenCalled()
  })
})
