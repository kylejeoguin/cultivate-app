'use client'

import { useState } from 'react'

// The email is required — capturing the lead is this page's entire job — but the pack
// downloads the instant they submit. No confirm-your-email round trip; that step loses
// half of them and this audience came from a Pinterest pin, not a newsletter signup.

export default function FreeWorksheetsClient({ source }: { source: string }) {
  const [email, setEmail] = useState('')
  const [status, setStatus] = useState<'idle' | 'sending' | 'done'>('idle')
  const [error, setError] = useState('')

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setStatus('sending')

    try {
      const res = await fetch('/api/free-worksheets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, source }),
      })
      const data = await res.json()

      if (!res.ok || !data.url) {
        setError(data.error || 'Something went wrong. Try again in a moment.')
        setStatus('idle')
        return
      }

      // Hand them the file immediately. The signed URL is short-lived, so navigate now.
      setStatus('done')
      window.location.href = data.url
    } catch {
      setError('Something went wrong. Check your connection and try again.')
      setStatus('idle')
    }
  }

  if (status === 'done') {
    return (
      <div className="bg-green-50 dark:bg-green-950/30 border border-green-200 dark:border-green-900/50 rounded-2xl p-6 text-center">
        <div className="text-3xl mb-3">✏️</div>
        <p className="text-content font-semibold mb-1">Your download is starting.</p>
        <p className="text-muted text-sm">
          If it didn&apos;t, check your browser&apos;s downloads — or{' '}
          <button onClick={() => setStatus('idle')} className="text-green-700 dark:text-green-400 hover:text-green-700 dark:text-green-300 underline">
            try again
          </button>
          .
        </p>
      </div>
    )
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <label htmlFor="fw-email" className="block text-sm font-medium text-muted">
        Where should we send it?
      </label>
      <div className="flex flex-col sm:flex-row gap-3">
        <input
          id="fw-email"
          type="email"
          required
          value={email}
          onChange={e => setEmail(e.target.value)}
          placeholder="you@example.com"
          className="flex-1 bg-card border border-line-strong rounded-xl px-4 py-3.5 text-base text-content placeholder-subtle focus:outline-none focus:ring-2 focus:ring-green-600 focus:border-green-600 transition-all"
        />
        <button
          type="submit"
          disabled={status === 'sending'}
          className="shrink-0 bg-green-700 hover:bg-green-600 disabled:opacity-60 text-white font-semibold px-6 py-3.5 rounded-xl transition-colors"
        >
          {status === 'sending' ? 'Getting it…' : 'Get the pack'}
        </button>
      </div>
      {error && (
        <p role="alert" className="text-red-700 dark:text-red-400 text-sm">{error}</p>
      )}
      <p className="text-subtle text-xs">
        Free, no account needed. We&apos;ll email you when we add new printables — unsubscribe any time.
      </p>
    </form>
  )
}
