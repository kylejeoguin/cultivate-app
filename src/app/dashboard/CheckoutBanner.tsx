'use client'

import { useEffect, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import Link from 'next/link'

export default function CheckoutBanner({
  tier,
  childCount,
}: {
  tier: string | null
  childCount: number
}) {
  const params = useSearchParams()
  const [banner, setBanner] = useState<'family' | 'upgrade' | null>(null)

  useEffect(() => {
    // Post-checkout family invite prompt
    if (params.get('checkout') === 'success' && tier === 'family') {
      setBanner('family')
      return
    }
    // Second-child upgrade prompt — show once per session if on individual plan
    if (childCount >= 2 && tier === 'individual') {
      const dismissed = sessionStorage.getItem('upgrade-prompt-dismissed')
      if (!dismissed) setBanner('upgrade')
    }
  }, [params, tier, childCount])

  function dismiss() {
    sessionStorage.setItem('upgrade-prompt-dismissed', '1')
    setBanner(null)
  }

  if (!banner) return null

  if (banner === 'family') {
    return (
      <div className="bg-green-50 dark:bg-green-950/40 border border-green-200 dark:border-green-800/50 rounded-xl px-5 py-4 mb-6 flex items-start justify-between gap-4">
        <div>
          <p className="text-sm font-bold text-green-800 dark:text-green-300 mb-1">🎉 Welcome to the Family plan!</p>
          <p className="text-xs text-muted leading-relaxed">
            You can now invite your partner to access your family&apos;s Cultivate account.
            They&apos;ll get full access — same children, same records, everything.
          </p>
          <Link
            href="/dashboard/account"
            className="inline-block mt-3 text-xs font-semibold text-green-700 dark:text-green-400 hover:text-green-800 dark:hover:text-green-300 transition-colors"
          >
            Invite your partner → Account settings
          </Link>
        </div>
        <button onClick={dismiss} className="text-subtle hover:text-muted text-sm shrink-0 mt-0.5">✕</button>
      </div>
    )
  }

  if (banner === 'upgrade') {
    return (
      <div className="bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800/40 rounded-xl px-5 py-4 mb-6 flex items-start justify-between gap-4">
        <div>
          <p className="text-sm font-bold text-amber-800 dark:text-amber-300 mb-1">Managing multiple learners?</p>
          <p className="text-xs text-muted leading-relaxed">
            The Family plan adds a second parent login so both of you can log, view records, and track progress together — for just $4 more per month.
          </p>
          <div className="flex items-center gap-4 mt-3">
            <Link
              href="/pricing"
              className="text-xs font-semibold text-amber-700 dark:text-amber-400 hover:text-amber-800 dark:hover:text-amber-300 transition-colors"
            >
              Upgrade to Family →
            </Link>
            <button onClick={dismiss} className="text-xs text-subtle hover:text-muted transition-colors">
              Not now
            </button>
          </div>
        </div>
        <button onClick={dismiss} className="text-subtle hover:text-muted text-sm shrink-0 mt-0.5">✕</button>
      </div>
    )
  }

  return null
}
