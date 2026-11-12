'use client'

import { useEffect } from 'react'
import * as Sentry from '@sentry/nextjs'

// Error boundary for the dashboard segment. Renders inside the dashboard layout,
// so the user keeps their nav/chrome and gets a friendly retry instead of a crash.
export default function DashboardError({
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
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 px-6 text-center">
      <h1 className="text-xl font-semibold text-stone-900">Something went wrong</h1>
      <p className="max-w-md text-subtle">
        We hit an unexpected error loading this page and our team has been notified. Your records are safe.
      </p>
      <button
        onClick={() => reset()}
        className="mt-2 rounded-lg bg-green-600 px-5 py-2.5 font-semibold text-white transition hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-green-600/40"
      >
        Try again
      </button>
    </div>
  )
}
