'use client'

import { useState } from 'react'

/**
 * Sends the subscriber to the Stripe Customer Portal, where they can update payment,
 * switch plans, and CANCEL self-serve. Shown for anyone with a Stripe customer on file
 * (trialing or active). The portal session is created server-side at /api/stripe/portal.
 *
 * This replaced a dead button that linked to /pricing — there was previously no
 * self-serve cancel path in the app at all.
 */
export default function ManageBillingButton({ label }: { label: string }) {
  const [status, setStatus] = useState<'idle' | 'loading' | 'error'>('idle')

  async function openPortal() {
    setStatus('loading')
    try {
      const res = await fetch('/api/stripe/portal', { method: 'POST' })
      const data = await res.json()
      if (!res.ok || !data?.url) throw new Error(data?.error || 'Could not open billing portal')
      window.location.href = data.url
    } catch {
      setStatus('error')
      setTimeout(() => setStatus('idle'), 5000)
    }
  }

  return (
    <div className="space-y-1.5">
      <button
        onClick={openPortal}
        disabled={status === 'loading'}
        className="flex items-center justify-center gap-2 w-full py-2.5 px-4 bg-gradient-to-r from-green-800/60 to-green-900/40 hover:from-green-700/60 hover:to-green-800/40 border border-green-800/50 hover:border-green-700/60 text-green-300 hover:text-green-200 font-medium rounded-lg transition-all text-sm disabled:opacity-60 disabled:cursor-not-allowed"
      >
        {status === 'loading' && (
          <span className="inline-block w-3.5 h-3.5 border-2 border-green-300 border-t-transparent rounded-full animate-spin" />
        )}
        {status === 'loading' ? 'Opening billing…' : label}
      </button>
      {status === 'error' && (
        <p className="text-xs text-red-600 dark:text-red-400">
          Couldn&apos;t open the billing portal. Email{' '}
          <a href="mailto:hello@mycultivate.app" className="underline">hello@mycultivate.app</a> and we&apos;ll sort it out.
        </p>
      )}
      <p className="text-xs text-subtle">Update payment, switch plans, or cancel anytime — no emails or hoops.</p>
    </div>
  )
}
