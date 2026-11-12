'use client'

import { useEffect } from 'react'
import * as Sentry from '@sentry/nextjs'

// Top-level error boundary. Catches errors thrown in the root layout itself.
// Must render its own <html>/<body> because it replaces the root layout.
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    Sentry.captureException(error)
  }, [error])

  return (
    <html lang="en">
      <body style={{ fontFamily: 'system-ui, sans-serif', background: '#faf9f7', color: '#1c1917', margin: 0 }}>
        <main
          style={{
            minHeight: '100vh',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '1rem',
            padding: '2rem',
            textAlign: 'center',
          }}
        >
          <h1 style={{ fontSize: '1.5rem', margin: 0 }}>Something went wrong</h1>
          <p style={{ maxWidth: '32rem', color: '#57534e', margin: 0 }}>
            We hit an unexpected error and our team has been notified. Your data is safe. Please try again.
          </p>
          <button
            onClick={() => reset()}
            style={{
              marginTop: '0.5rem',
              padding: '0.625rem 1.25rem',
              borderRadius: '0.5rem',
              border: 'none',
              background: '#16a34a',
              color: 'white',
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            Try again
          </button>
        </main>
      </body>
    </html>
  )
}
