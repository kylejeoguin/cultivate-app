'use client'

import Link from 'next/link'
import { useState } from 'react'

// The interactive heart of the funnel: someone types one sentence about their day and watches
// Cultivate build the FULL record it would capture — school credit, homestead production, a
// logged sale, equipment maintenance. Talks to the public, rate-limited /api/demo-tag endpoint.
// Nothing is saved — it is a pure demo in both places it appears.
//
// Used in two places, ONE styling (BUILD-BIBLE Dim 1). Since the marketing funnel moved onto the
// same semantic tokens as the app (2026-07-24), there is no longer a separate dark "marketing"
// skin — both render from bg-card / text-content / border-line and follow the user's theme,
// which now defaults to light. `variant` therefore only decides the footer CTA:
//   'marketing' — /try paid landing: CTA is a signup link.
//   'app'       — first screen of onboarding: CTA is a continue callback.
// The onboarding placement exists because new users gave the app 25–76 seconds and never logged
// anything: if that is the whole attention budget, a setup wizard spends all of it and the aha
// never gets a turn. Show the magic first, configure after.

const EXAMPLES = [
  'The kids did math pages for about an hour, then we collected a dozen eggs from the coop and sold them to a neighbor for $5',
  'Read two chapters of Farmer Boy with the kids, then weeded the garden and picked 8 lbs of tomatoes',
  'Replaced the kitchen faucet with the kids — measured the lines, cut them, and talked about water pressure',
]

interface Tags {
  subjects: string[]
  minutes: number | null
  homestead: string | null
  sale: number | null
  maintenance: string | null
}

// Fire a first-party analytics event, reusing the same session id the landing beacon set.
// Fire-and-forget — a tracking failure must never affect the demo.
function track(event_type: string, source: string, path: string, metadata?: Record<string, unknown>) {
  try {
    let sid = ''
    try { sid = sessionStorage.getItem('cv_sid') || '' } catch { /* blocked */ }
    const body = JSON.stringify({
      event_type,
      session_id: sid,
      path,
      source: source || null,
      metadata: metadata || {},
    })
    fetch('/api/track', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
      keepalive: true,
    }).catch(() => {})
  } catch { /* never throw from analytics */ }
}

function money(n: number): string {
  return n % 1 === 0 ? `$${n}` : `$${n.toFixed(2)}`
}

function RecordRow({ icon, label, children }: { icon: string; label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-3">
      <span className="text-lg leading-none mt-0.5" aria-hidden="true">{icon}</span>
      <div className="min-w-0">
        <p className="text-[11px] font-semibold uppercase tracking-wide mb-1 text-subtle">{label}</p>
        {children}
      </div>
    </div>
  )
}

export default function DemoTagBox({
  signupHref,
  source,
  variant = 'marketing',
  initialText = '',
  onContinue,
  continueLabel = 'Continue →',
}: {
  signupHref?: string
  source: string
  variant?: 'marketing' | 'app'
  initialText?: string
  onContinue?: () => void
  continueLabel?: string
}) {
  const [text, setText] = useState(initialText)
  const [tags, setTags] = useState<Tags | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const isApp = variant === 'app'
  const path = isApp ? '/dashboard/onboarding' : '/try'

  // One round-trip to the tagger. status 0 means the request never landed (network).
  async function callTagger(description: string): Promise<{ ok: boolean; data: unknown; status: number }> {
    try {
      const res = await fetch('/api/demo-tag', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ description }),
      })
      const data = await res.json().catch(() => null)
      const ok = res.ok && !!data && Array.isArray((data as Tags).subjects)
      return { ok, data, status: res.status }
    } catch {
      return { ok: false, data: null, status: 0 }
    }
  }

  async function tagIt() {
    const description = text.trim()
    if (!description || loading) return
    setLoading(true)
    setError(null)
    setTags(null)
    // Fire BEFORE the call. Both of our success signals — the demo_tag event below and the
    // server's demo_usage counter (increment-on-success only) — record ONLY when the tagger
    // works, so without this an outage and an untouched page produce identical telemetry:
    // two empty tables. "Nobody typed" must be distinguishable from "everybody typed and got
    // a 503." attempts − (demo_tag + demo_error) should reconcile to ~0. (Found 2026-07-24.)
    // One attempt event per user intent, not per HTTP call — the retry below must not inflate it.
    track('demo_attempt', source, path)
    try {
      let r = await callTagger(description)

      // Retry ONCE, silently, on a transient failure. A 503 here is usually a blip on the
      // Anthropic call and a second try lands; the visitor should never see a flicker for
      // something that fixed itself. Deliberately NOT retried: 429 (the rate limit is working
      // as designed — hammering it is rude) and other 4xx (same input, same answer). The server
      // counts only SUCCESSES toward the per-IP cap, so a retry costs the visitor no quota.
      let retried = false
      if (!r.ok && (r.status === 503 || r.status === 0)) {
        retried = true
        await new Promise(resolve => setTimeout(resolve, 700))
        r = await callTagger(description)
      }

      if (r.ok) {
        const tagged = r.data as Tags
        setTags(tagged)
        track('demo_tag', source, path, {
          subjects: tagged.subjects,
          homestead: !!tagged.homestead,
          sale: tagged.sale != null,
          retried,
        })
      } else {
        const body = r.data as { error?: unknown } | null
        setError(typeof body?.error === 'string' ? body.error : 'Something went wrong — give it another try.')
        // Reason distinguishes the failure modes that need different responses: http_429 =
        // rate-limit (working as designed), http_503 = tagger/Anthropic down (page it),
        // bad_payload = contract drift, network = the visitor's connection.
        const reason =
          r.status === 0 ? 'network'
          : r.status >= 200 && r.status < 300 ? 'bad_payload'
          : `http_${r.status}`
        track('demo_error', source, path, { reason, retried })
      }
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className={isApp ? 'text-left' : 'mt-10 max-w-xl mx-auto text-left'}>
      <div className="bg-card border border-line rounded-2xl p-5 sm:p-6 shadow-sm">
        <label htmlFor="demo-input" className="block text-sm font-medium mb-2 text-content">
          What did you and the kids do today?
        </label>
        <textarea
          id="demo-input"
          value={text}
          onChange={(e) => setText(e.target.value)}
          maxLength={200}
          rows={3}
          placeholder={EXAMPLES[0]}
          className="w-full resize-none rounded-xl bg-surface border border-line-strong focus:border-green-600 focus:ring-1 focus:ring-green-600 outline-none text-content placeholder-subtle text-sm px-4 py-3 transition-colors"
        />

        <div className="mt-2 flex flex-wrap items-center gap-2">
          <span className="text-xs text-subtle">Try one:</span>
          {EXAMPLES.map((ex, i) => (
            <button
              key={i}
              type="button"
              onClick={() => { setText(ex); setError(null) }}
              className="text-xs text-muted hover:text-green-600 dark:hover:text-green-400 underline decoration-line-strong hover:decoration-green-600 underline-offset-2 transition-colors"
            >
              Example {i + 1}
            </button>
          ))}
        </div>

        <button
          type="button"
          onClick={tagIt}
          disabled={loading || !text.trim()}
          className="mt-4 w-full inline-flex items-center justify-center gap-2 bg-green-700 hover:bg-green-600 disabled:opacity-40 disabled:hover:bg-green-700 text-white font-semibold px-6 py-3 rounded-xl transition-colors text-sm"
        >
          {loading ? 'Building your record…' : 'Tag my day →'}
        </button>

        {/* A failed demo must never be a dead end. The visitor arrived from a paid ad and the one
            thing we owed them didn't work — give them the real product rather than an apology and
            nowhere to go. (We deliberately do NOT fall back to a canned "tagged" result: showing
            fabricated output as if the AI produced it would be lying to a customer.) */}
        {error && (
          <div className="mt-3">
            <p role="alert" className="text-sm text-amber-700 dark:text-amber-400">{error}</p>
            {isApp ? (
              <button
                type="button"
                onClick={onContinue}
                className="mt-2 text-sm font-medium text-green-700 dark:text-green-400 hover:underline underline-offset-2"
              >
                Skip ahead and set up my account →
              </button>
            ) : (
              <Link
                href={signupHref || '/signup'}
                onClick={() => track('demo_cta', source, path, { from: 'error' })}
                className="mt-2 inline-block text-sm font-medium text-green-700 dark:text-green-400 hover:underline underline-offset-2"
              >
                Start your free trial and log for real →
              </Link>
            )}
          </div>
        )}

        {/* Result region — announced to screen readers when the record arrives. */}
        <div aria-live="polite" className="mt-1">
          {tags && (
            <div className="mt-5 border-t border-line pt-5">
              <p className="text-xs font-semibold uppercase tracking-widest mb-4 text-subtle">
                From one sentence, Cultivate logged
              </p>

              <div className="space-y-4">
                {tags.subjects.length > 0 && (
                  <RecordRow icon="🎓" label="School">
                    <div className="flex flex-wrap items-center gap-2">
                      {tags.subjects.map((sub) => (
                        <span
                          key={sub}
                          className="inline-flex items-center rounded-full bg-green-50 dark:bg-green-950/40 border border-green-200 dark:border-green-900/60 text-green-700 dark:text-green-300 text-sm font-medium px-3 py-1"
                        >
                          {sub}
                        </span>
                      ))}
                    </div>
                  </RecordRow>
                )}

                {tags.homestead && (
                  <RecordRow icon="🌱" label="Garden & animals">
                    <p className="text-sm text-content">{tags.homestead}</p>
                  </RecordRow>
                )}

                {tags.sale != null && (
                  <RecordRow icon="💵" label="Income">
                    <p className="text-sm font-semibold text-amber-600 dark:text-amber-300">{money(tags.sale)} logged</p>
                  </RecordRow>
                )}

                {tags.maintenance && (
                  <RecordRow icon="🔧" label="Equipment">
                    <p className="text-sm text-content">{tags.maintenance}</p>
                  </RecordRow>
                )}
              </div>

              {tags.minutes != null && (
                <p className="mt-4 text-xs text-subtle">⏱️ ~{tags.minutes} min logged</p>
              )}

              {isApp ? (
                <>
                  <p className="text-sm leading-relaxed mt-5 mb-5 text-muted">
                    That&apos;s the whole app. Write it the way you&apos;d say it out loud — Cultivate
                    sorts it into school credit, garden and animal records, house projects, and income,
                    and keeps your hours, attendance, and state records building in the background.
                  </p>
                  <button
                    type="button"
                    onClick={onContinue}
                    className="inline-flex w-full items-center justify-center gap-2 bg-gradient-to-r from-green-700 to-green-600 hover:from-green-600 hover:to-green-500 text-white font-semibold px-8 py-3.5 rounded-xl transition-all shadow-lg shadow-green-900/20 text-base"
                  >
                    {continueLabel}
                  </button>
                  <p className="text-xs text-center mt-3 text-subtle">
                    Nothing was saved — that was a practice run. Two quick questions and you&apos;re in.
                  </p>
                </>
              ) : (
                <>
                  <p className="text-sm leading-relaxed mt-5 mb-5 text-muted">
                    One sentence — and Cultivate captured all of it: school credit, garden and animal
                    records, house projects, and any income, together. In the app it also tracks your
                    hours, attendance, and state compliance automatically, and the work around your
                    place counts toward school credit.
                  </p>
                  <Link
                    href={signupHref || '/signup'}
                    onClick={() => track('demo_cta', source, path)}
                    className="inline-flex w-full items-center justify-center gap-2 bg-gradient-to-r from-green-700 to-green-600 hover:from-green-600 hover:to-green-500 text-white font-semibold px-8 py-3.5 rounded-xl transition-all shadow-lg shadow-green-900/20 text-base"
                  >
                    Try it free →
                  </Link>
                  <p className="text-xs text-center mt-3 text-subtle">
                    The full app, free for 7 days.
                  </p>
                </>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
