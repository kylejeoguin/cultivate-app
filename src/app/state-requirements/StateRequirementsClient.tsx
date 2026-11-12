'use client'

import { useState } from 'react'
import Link from 'next/link'
import { STATE_COMPLIANCE, LAST_VERIFIED, type StateCompliance } from '@/lib/stateCompliance'
import { stateSlug } from '@/lib/stateSlug'

function LeafLogo() {
  return (
    <svg viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-9 h-9">
      <path d="M16 4C16 4 6 10 6 20C6 25.523 10.477 30 16 30C21.523 30 26 25.523 26 20C26 10 16 4 16 4Z" fill="url(#leafGradSR)" />
      <path d="M16 4C16 4 6 10 6 20" stroke="#4ade80" strokeWidth="1" strokeLinecap="round" opacity="0.4" />
      <path d="M16 30L16 12" stroke="#052e16" strokeWidth="1.5" strokeLinecap="round" opacity="0.5" />
      <defs>
        <linearGradient id="leafGradSR" x1="16" y1="4" x2="16" y2="30" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#4ade80" />
          <stop offset="100%" stopColor="#15803d" />
        </linearGradient>
      </defs>
    </svg>
  )
}

export default function StateRequirementsClient({ source }: { source: string }) {
  const [abbr, setAbbr] = useState('')
  const [email, setEmail] = useState('')
  const [status, setStatus] = useState<'idle' | 'sending' | 'done' | 'error'>('idle')
  const [errorMsg, setErrorMsg] = useState('')

  const state: StateCompliance | undefined = STATE_COMPLIANCE.find((s) => s.abbr === abbr)
  const trialHref = `/signup?source=${encodeURIComponent(source)}${abbr ? `&state=${abbr}` : ''}`

  function onPick(next: string) {
    setAbbr(next)
    setStatus('idle')
    setErrorMsg('')
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (status === 'sending') return
    setStatus('sending')
    setErrorMsg('')
    try {
      const res = await fetch('/api/lead', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, state: abbr, source }),
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

  return (
    <div className="min-h-screen bg-surface text-content">
      {/* Nav */}
      <nav className="border-b border-line px-6 py-4">
        <div className="max-w-5xl mx-auto flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2.5">
            <LeafLogo />
            <span className="text-lg font-bold tracking-tight text-content">Cultivate</span>
          </Link>
          <div className="flex items-center gap-4">
            <Link href="/login" className="text-sm text-muted hover:text-content transition-colors">
              Sign in
            </Link>
            <Link
              href={trialHref}
              className="text-sm bg-green-700 hover:bg-green-600 text-white px-4 py-2 rounded-lg transition-colors font-medium"
            >
              Start free trial
            </Link>
          </div>
        </div>
      </nav>

      {/* Hero + picker */}
      <section className="max-w-3xl mx-auto px-6 pt-20 pb-10 text-center">
        <div className="inline-flex items-center gap-2 bg-green-50 dark:bg-green-950/50 border border-green-200 dark:border-green-900/50 rounded-full px-4 py-1.5 mb-8">
          <span className="w-1.5 h-1.5 rounded-full bg-green-500 shrink-0"></span>
          <span className="text-green-700 dark:text-green-400 text-xs font-medium">Free · Updated 2026 · All 50 states + DC</span>
        </div>

        <h1 className="text-4xl sm:text-5xl font-bold tracking-tight leading-tight mb-5">
          What does your state require<br />
          <span className="text-green-700 dark:text-green-400">to homeschool?</span>
        </h1>
        <p className="text-muted text-lg leading-relaxed max-w-xl mx-auto mb-10">
          Pick your state for the plain-English rule — instruction time, testing, and the exact
          legal citation. Then grab your free, print-ready compliance checklist.
        </p>

        <div className="max-w-sm mx-auto">
          <label htmlFor="state" className="sr-only">Select your state</label>
          <select
            id="state"
            value={abbr}
            onChange={(e) => onPick(e.target.value)}
            className="w-full bg-card border border-line-strong rounded-xl px-4 py-3.5 text-base text-content focus:outline-none focus:ring-2 focus:ring-green-600 focus:border-green-600 transition-all"
          >
            <option value="">Choose your state…</option>
            {STATE_COMPLIANCE.map((s) => (
              <option key={s.abbr} value={s.abbr}>{s.name}</option>
            ))}
          </select>
        </div>
      </section>

      {/* Result */}
      {state && (
        <section className="max-w-2xl mx-auto px-6 pb-16">
          <div className="bg-card border border-line rounded-2xl p-6 sm:p-8">
            <h2 className="text-2xl font-bold tracking-tight mb-1.5">{state.name} homeschool requirements</h2>
            <p className="text-subtle text-xs mb-6">
              Last verified {LAST_VERIFIED} · A starting point, not legal advice — {state.name} sets the rules and they change.
            </p>

            {/* At a glance */}
            <div className="rounded-xl border border-green-200 dark:border-green-900/50 bg-green-50 dark:bg-green-950/20 divide-y divide-stone-800/70 mb-7">
              <div className="flex flex-col sm:flex-row sm:items-start gap-1 sm:gap-4 px-4 py-3">
                <span className="text-xs font-semibold text-green-700 dark:text-green-400 uppercase tracking-wide sm:w-40 shrink-0">Instruction required</span>
                <span className="text-sm text-muted">{state.headline}</span>
              </div>
              <div className="flex flex-col sm:flex-row sm:items-start gap-1 sm:gap-4 px-4 py-3">
                <span className="text-xs font-semibold text-green-700 dark:text-green-400 uppercase tracking-wide sm:w-40 shrink-0">Standardized testing</span>
                <span className="text-sm text-muted">{state.testing}</span>
              </div>
              <div className="flex flex-col sm:flex-row sm:items-start gap-1 sm:gap-4 px-4 py-3">
                <span className="text-xs font-semibold text-green-700 dark:text-green-400 uppercase tracking-wide sm:w-40 shrink-0">Legal citation</span>
                <span className="text-sm text-muted">{state.citation}</span>
              </div>
            </div>

            {/* The rule */}
            <h3 className="text-sm font-semibold text-muted uppercase tracking-wide mb-2">The rule, in plain English</h3>
            <p className="text-muted leading-relaxed mb-5">{state.summary}</p>

            {/* Confirm-with-your-state — visible, not buried. We point to the authority. */}
            <div className="rounded-xl border border-amber-200 dark:border-amber-900/40 bg-amber-50 dark:bg-amber-950/15 px-4 py-3.5 mb-7 flex items-start gap-3">
              <span className="text-amber-700 dark:text-amber-400 text-lg leading-none mt-0.5 shrink-0">⚖️</span>
              <p className="text-sm text-muted leading-relaxed">
                Laws change — always confirm the current rules for {state.name} yourself before relying on them.
                {' '}
                <a
                  href={state.hslda}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-amber-700 dark:text-amber-400 underline underline-offset-2 hover:text-amber-200 font-medium"
                >
                  See {state.name}&apos;s official requirements on HSLDA →
                </a>
              </p>
            </div>

            {/* Link to the full, indexable state guide (internal linking + canonical SEO page) */}
            <p className="mb-7">
              <Link
                href={`/state-requirements/${stateSlug(state.name)}`}
                className="text-sm text-green-700 dark:text-green-400 hover:text-green-700 dark:text-green-300 underline underline-offset-2 font-medium"
              >
                Read the full {state.name} homeschool requirements guide →
              </Link>
            </p>

            {/* Email gate → PDF */}
            {status !== 'done' ? (
              <form onSubmit={onSubmit} className="rounded-xl border border-line-strong bg-surface/60 p-5">
                <p className="font-semibold text-content mb-1">
                  Get your free {state.name} Homeschool Compliance Checklist
                </p>
                <p className="text-muted text-sm mb-4">
                  A one-page, print-ready PDF — exactly what to track to stay compliant in {state.name}.
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
            ) : (
              <div className="rounded-xl border border-green-200 dark:border-green-800/60 bg-green-50 dark:bg-green-950/30 p-5 text-center">
                <div className="text-3xl mb-2">✅</div>
                <p className="font-semibold text-content mb-1">Your checklist is ready</p>
                <p className="text-muted text-sm mb-4">Download it below — we&apos;ve also sent a copy to your inbox.</p>
                <a
                  href={state.checklistPdf}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center justify-center gap-2 bg-green-700 hover:bg-green-600 text-white font-semibold px-6 py-3 rounded-lg transition-all"
                >
                  ⬇ Download the {state.name} checklist (PDF)
                </a>
              </div>
            )}
          </div>

          <p className="text-subtle text-xs text-center mt-4 max-w-xl mx-auto">
            This is a plain-English summary for your convenience, not legal advice. Cultivate helps you
            store, organize, and produce your homeschool records — it isn&apos;t the authority on what your
            state requires. Homeschool laws change; always confirm current rules with your state or a
            homeschool legal resource (e.g., HSLDA) before relying on them.
          </p>
        </section>
      )}

      {/* Browse all states — crawlable internal links to every state guide */}
      <section className="border-t border-line">
        <div className="max-w-3xl mx-auto px-6 py-14">
          <h2 className="text-xl font-bold tracking-tight mb-1.5">Homeschool requirements by state</h2>
          <p className="text-subtle text-sm mb-6">
            Plain-English rules, testing, and the legal citation for all 50 states + DC. Updated {LAST_VERIFIED}.
          </p>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-6 gap-y-2.5">
            {STATE_COMPLIANCE.map((s) => (
              <Link
                key={s.abbr}
                href={`/state-requirements/${stateSlug(s.name)}`}
                className="text-sm text-muted hover:text-green-700 dark:text-green-300 transition-colors"
              >
                {s.name} homeschool requirements
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* How Cultivate helps */}
      <section className="border-t border-line bg-elevated">
        <div className="max-w-2xl mx-auto px-6 py-16 text-center">
          <p className="text-xs font-semibold text-subtle uppercase tracking-widest mb-4">Stop tracking this on paper</p>
          <h2 className="text-2xl sm:text-3xl font-bold tracking-tight mb-5">
            Cultivate keeps your records — and produces the documents.
          </h2>
          <p className="text-muted leading-relaxed mb-8">
            Your state sets the rules. Cultivate handles the rest: log your homeschool day in plain English,
            and it stores it, organizes it by subject, tallies your hours and days, reminds you before filing
            deadlines, and produces print-ready transcripts and compliance reports for {state ? state.name : 'your state'} on demand.
            One place to keep it all — homeschool <em>and</em> home life.
          </p>
          <Link
            href={trialHref}
            className="inline-flex items-center justify-center bg-gradient-to-r from-green-700 to-green-600 hover:from-green-600 hover:to-green-500 text-white font-semibold px-8 py-3.5 rounded-xl transition-all shadow-lg shadow-green-900/30"
          >
            Start your free 7-day trial
          </Link>
          <p className="text-subtle text-xs mt-4">
            7-day free trial · Cancel anytime before it ends
          </p>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-line px-6 py-8">
        <div className="max-w-5xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4">
          <Link href="/" className="flex items-center gap-2">
            <LeafLogo />
            <span className="text-sm font-semibold text-muted">Cultivate</span>
          </Link>
          <div className="flex items-center gap-6 text-xs text-subtle">
            <Link href="/pricing" className="hover:text-muted transition-colors">Pricing</Link>
            <Link href="/login" className="hover:text-muted transition-colors">Sign in</Link>
            <Link href="/privacy" className="hover:text-muted transition-colors">Privacy</Link>
          </div>
          <p className="text-xs text-subtle">Built by a homeschooling family — for ours, and for yours.</p>
        </div>
      </footer>
    </div>
  )
}
