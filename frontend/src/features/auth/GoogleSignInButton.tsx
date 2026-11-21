import { useEffect, useRef, useState } from 'react'

const SCRIPT_ID = 'google-identity-services'
const CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID as string | undefined

interface GoogleCredentialResponse {
  credential: string
}

interface GoogleIdentityServices {
  accounts: {
    id: {
      initialize: (options: {
        client_id: string
        callback: (response: GoogleCredentialResponse) => void
      }) => void
      renderButton: (element: HTMLElement, options: Record<string, unknown>) => void
    }
  }
}

declare global {
  interface Window {
    google?: GoogleIdentityServices
  }
}

let scriptPromise: Promise<void> | null = null

function loadGoogleScript(): Promise<void> {
  if (window.google?.accounts?.id) return Promise.resolve()

  if (!scriptPromise) {
    scriptPromise = new Promise((resolve, reject) => {
      const existing = document.getElementById(SCRIPT_ID) as HTMLScriptElement | null
      if (existing) {
        existing.addEventListener('load', () => resolve(), { once: true })
        existing.addEventListener('error', () => reject(new Error('Google script failed')), {
          once: true,
        })
        return
      }

      const script = document.createElement('script')
      script.id = SCRIPT_ID
      script.src = 'https://accounts.google.com/gsi/client'
      script.async = true
      script.defer = true
      script.onload = () => resolve()
      script.onerror = () => reject(new Error('Could not load Google sign-in'))
      document.head.appendChild(script)
    })
  }

  return scriptPromise
}

type State = 'loading' | 'ready' | 'error' | 'unconfigured'

export function GoogleSignInButton({
  onCredential,
  disabled = false,
}: {
  onCredential: (idToken: string) => void
  disabled?: boolean
}) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [state, setState] = useState<State>(CLIENT_ID ? 'loading' : 'unconfigured')

  useEffect(() => {
    if (!CLIENT_ID || disabled) return

    let active = true

    loadGoogleScript()
      .then(() => {
        if (!active || !window.google || !containerRef.current) return

        window.google.accounts.id.initialize({
          client_id: CLIENT_ID,
          callback: (response) => onCredential(response.credential),
        })
        window.google.accounts.id.renderButton(containerRef.current, {
          type: 'standard',
          theme: 'outline',
          size: 'large',
          text: 'signin_with',
          shape: 'rectangular',
          width: 320,
        })
        setState('ready')
      })
      .catch(() => {
        if (active) setState('error')
      })

    return () => {
      active = false
    }
  }, [onCredential, disabled])

  if (state === 'unconfigured') {
    return (
      <div className="rounded-md border border-dashed border-border p-4 text-sm text-muted-foreground">
        Google sign-in is not configured. Set <code>VITE_GOOGLE_CLIENT_ID</code> in{' '}
        <code>frontend/.env.local</code> to enable it.
      </div>
    )
  }

  if (state === 'error') {
    return <p className="text-sm text-destructive">Could not load Google sign-in. Try reloading.</p>
  }

  return (
    <div
      ref={containerRef}
      className="flex min-h-11 items-center justify-center"
      aria-busy={state === 'loading'}
    />
  )
}
