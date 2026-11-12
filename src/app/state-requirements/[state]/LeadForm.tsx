'use client'

import { useState } from 'react'

// Client island for the email-gated checklist download on the static state pages.
// Mirrors the capture flow in StateRequirementsClient, scoped to one known state.
export default function LeadForm({
  stateAbbr,
  stateName,
  checklistPdf,
  source,
}: {
  stateAbbr: string
  stateName: string
  checklistPdf: string
  source: string
}) {
  const [email, setEmail] = useState('')
  const [status, setStatus] = useState<'idle' | 'sending' | 'done' | 'error'>('idle')
  const [errorMsg, setErrorMsg] = useState('')

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (status === 'sending') return
    setStatus('sending')
    setErrorMsg('')
    try {
      const res = await fetch('/api/lead', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, state: stateAbbr, source }),
      })
      const data = await res.json()
      if (!res.ok || !data.ok) {
        setErrorMsg(data.error || 'Something went wrong. Please try again.')
        setStatus('error')
        return
      }
      setStatus('done')
    } catch {
      setErrorMsg('Network error. Please try again.')
      setStatus('error')
    }
  }

  if (status === 'done') {
    return (
      <div className="rounded-xl border border-green-200 dark:border-green-800/60 bg-green-50 dark:bg-green-950/30 p-5 text-center">
        <div className="text-3xl mb-2">✅</div>
        <p className="font-semibold text-content mb-1">Your checklist is ready</p>
        <p className="text-muted text-sm mb-4">Download it below — we&apos;ve also sent a copy to your inbox.</p>
        <a
          href={checklistPdf}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center justify-center gap-2 bg-green-700 hover:bg-green-600 text-white font-semibold px-6 py-3 rounded-lg transition-all"
        >
          ⬇ Download the {stateName} checklist (PDF)
        </a>
      </div>
    )
  }

  return (
    <form onSubmit={onSubmit} className="rounded-xl border border-line-strong bg-surface/60 p-5">
      <p className="font-semibold text-content mb-1">
        Get your free {stateName} Homeschool Compliance Checklist
      </p>
      <p className="text-muted text-sm mb-4">
        A one-page, print-ready PDF — exactly what to track to stay compliant in {stateName}.
      </p>
      <div className="flex flex-col sm:flex-row gap-2">
        <input
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@email.com"
          className="flex-1 bg-card border border-line-strong rounded-lg px-4 py-3 text-base text-content placeholder-subtle focus:outline-none focus:ring-2 focus:ring-green-600 focus:border-green-600"
        />
        <button
          type="submit"
          disabled={status === 'sending'}
          className="bg-gradient-to-r from-green-700 to-green-600 hover:from-green-600 hover:to-green-500 disabled:opacity-60 text-white font-semibold px-6 py-3 rounded-lg transition-all whitespace-nowrap"
        >
          {status === 'sending' ? 'Sending…' : 'Send my checklist'}
        </button>
      </div>
      {status === 'error' && <p className="text-red-700 dark:text-red-400 text-sm mt-2">{errorMsg}</p>}
      <p className="text-subtle text-xs mt-3">
        We&apos;ll email you occasional homeschool tips too. Unsubscribe anytime.
      </p>
    </form>
  )
}
