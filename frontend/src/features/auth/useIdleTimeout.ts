import { useEffect, useRef } from 'react'

export const IDLE_TIMEOUT_MS = 30 * 60 * 1000

const ACTIVITY_EVENTS: Array<keyof WindowEventMap> = [
  'mousedown',
  'keydown',
  'scroll',
  'touchstart',
  'mousemove',
]

/**
 * Signs the user out after a period without real user activity. Token refreshes
 * do not count as activity, so the 30-minute idle rule holds even while the
 * app keeps the session alive in the background.
 */
export function useIdleTimeout(enabled: boolean, onIdle: () => void, timeoutMs = IDLE_TIMEOUT_MS) {
  const onIdleRef = useRef(onIdle)
  onIdleRef.current = onIdle

  useEffect(() => {
    if (!enabled) return

    let timer: number | undefined
    let lastMouseMove = 0

    const reset = () => {
      window.clearTimeout(timer)
      timer = window.setTimeout(() => onIdleRef.current(), timeoutMs)
    }

    const handleActivity = (event: Event) => {
      if (event.type === 'mousemove') {
        const now = Date.now()
        if (now - lastMouseMove < 5000) return
        lastMouseMove = now
      }
      reset()
    }

    for (const eventName of ACTIVITY_EVENTS) {
      window.addEventListener(eventName, handleActivity, { passive: true })
    }
    reset()

    return () => {
      window.clearTimeout(timer)
      for (const eventName of ACTIVITY_EVENTS) {
        window.removeEventListener(eventName, handleActivity)
      }
    }
  }, [enabled, timeoutMs])
}
