'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

export default function CheckoutButton({
  isLoggedIn,
  plan,
  tier = 'individual',
  signupQuery,
}: {
  isLoggedIn: boolean
  plan: 'monthly' | 'annual'
  tier?: 'individual' | 'family'
  signupQuery?: string
}) {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)

  async function handleClick() {
    if (!isLoggedIn) {
      // Carry acquisition attribution (?source/&state) into signup so the
      // channel tag survives the pricing → signup hop.
      router.push(signupQuery ? `/signup?${signupQuery}` : '/signup')
      return
    }

    setLoading(true)
    setNotice(null)
    try {
      const res = await fetch('/api/stripe/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ plan, tier }),
      })
      const data = await res.json()
      if (data.url) {
        // Returning customer whose free trial was already used → they're headed to a paid
        // (trial-less) checkout. Tell them why before the redirect so a charge isn't a surprise.
        if (data.trialGranted === false) {
          setNotice('Your free trial has already been used — you\'ll be subscribed without another trial.')
          setTimeout(() => { window.location.href = data.url }, 1800)
          return
        }
        window.location.href = data.url
      } else {
        setNotice(
          data.error === 'already_subscribed'
            ? 'You already have an active subscription.'
            : 'Something went wrong. Please try again.'
        )
        setLoading(false)
      }
    } catch {
      setNotice('Something went wrong. Please try again.')
      setLoading(false)
    }
  }

  return (
    <>
      <button
        onClick={handleClick}
        disabled={loading}
        className="w-full bg-gradient-to-r from-green-700 to-green-600 hover:from-green-600 hover:to-green-500 disabled:opacity-60 text-white font-bold py-4 rounded-xl transition-all shadow-lg shadow-green-900/30 text-base mb-6"
      >
        {loading ? 'Redirecting...' : 'Start Free Trial'}
      </button>
      {notice && (
        <p className="-mt-4 mb-6 text-sm text-muted text-center">{notice}</p>
      )}
    </>
  )
}
