'use client'

import { useState } from 'react'
import Link from 'next/link'
import CheckoutButton from './CheckoutButton'

const INDIVIDUAL_FEATURES = [
  'Daily school log with AI subject tagging',
  'Attendance tracking and calendar view',
  'State compliance reporting (hours + subjects)',
  'Garden, livestock, and preservation count for school credit',
  'Equipment maintenance tracker',
  'PDF transcript export — print-ready, forever',
  'Subject gap detection and activity suggestions',
  'Unlimited children and school years',
  'Annual yearbook — school, garden, and animals, ready to print',
  'Data export anytime — your records, always yours',
]

const FAMILY_FEATURES = [
  'Everything in Individual',
  'Two parent logins — both parents get full access',
  'Shared children, logs, and records',
  'One subscription, one household',
]

export default function PricingToggle({
  isLoggedIn,
  isActive,
  signupQuery,
}: {
  isLoggedIn: boolean
  isActive: boolean
  signupQuery?: string
  features?: string[]
}) {
  const [billing, setBilling] = useState<'monthly' | 'annual'>('annual')
  const [tier, setTier] = useState<'individual' | 'family'>('individual')

  const prices = {
    individual: { monthly: 5, annual: 50 },
    family: { monthly: 8, annual: 80 },
  }

  const price = prices[tier][billing]
  const monthlyEquiv = billing === 'annual'
    ? (prices[tier].annual / 12).toFixed(2)
    : null
  const annualSavings = prices[tier].monthly * 12 - prices[tier].annual
  // Frame savings as "months free" — easier to grasp than a $ or % (Kyle feedback 2026-06-02).
  // Round to nearest half-month so we never overstate (Family is ~2.7 → shows 2.5, not 3).
  const monthsFree = Math.round((annualSavings / prices[tier].monthly) * 2) / 2
  const monthsLabel = `${monthsFree} month${monthsFree === 1 ? '' : 's'} free`

  const features = tier === 'individual' ? INDIVIDUAL_FEATURES : FAMILY_FEATURES

  return (
    <>
      {/* Tier toggle */}
      <div className="flex items-center justify-center mb-4">
        <div className="flex items-center bg-card border border-line rounded-xl p-1 gap-1 w-full">
          <button
            onClick={() => setTier('individual')}
            className={`flex-1 py-2 rounded-lg text-sm font-medium transition-colors ${
              tier === 'individual' ? 'bg-elevated text-content' : 'text-subtle hover:text-content'
            }`}
          >
            Individual
          </button>
          <button
            onClick={() => setTier('family')}
            className={`flex-1 py-2 rounded-lg text-sm font-medium transition-colors flex items-center justify-center gap-2 ${
              tier === 'family' ? 'bg-elevated text-content' : 'text-subtle hover:text-content'
            }`}
          >
            Family
            <span className="text-xs bg-amber-100 dark:bg-amber-900/60 text-amber-700 dark:text-amber-400 px-1.5 py-0.5 rounded font-semibold">
              2 logins
            </span>
          </button>
        </div>
      </div>

      {/* Billing toggle */}
      <div className="flex items-center justify-center mb-8">
        <div className="flex items-center bg-card border border-line rounded-xl p-1 gap-1">
          <button
            onClick={() => setBilling('monthly')}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              billing === 'monthly' ? 'bg-elevated text-content' : 'text-subtle hover:text-content'
            }`}
          >
            Monthly
          </button>
          <button
            onClick={() => setBilling('annual')}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors flex items-center gap-2 ${
              billing === 'annual' ? 'bg-elevated text-content' : 'text-subtle hover:text-content'
            }`}
          >
            Annual
            <span className="text-xs bg-green-100 dark:bg-green-900/60 text-green-700 dark:text-green-400 px-1.5 py-0.5 rounded font-semibold">
              {monthsFree} mo free
            </span>
          </button>
        </div>
      </div>

      {/* Pricing card */}
      <div className="bg-card border border-line-strong rounded-2xl p-8 mb-8">
        {billing === 'monthly' ? (
          <div className="flex items-end gap-2 mb-1">
            <span className="text-5xl font-bold tracking-tight">${price}</span>
            <span className="text-muted text-base mb-2">/month</span>
          </div>
        ) : (
          <div className="mb-1">
            <div className="flex items-end gap-2">
              <span className="text-5xl font-bold tracking-tight">${price}</span>
              <span className="text-muted text-base mb-2">/year</span>
            </div>
            <p className="text-subtle text-xs mt-1">
              ${monthlyEquiv}/month · like {monthsLabel} vs. paying monthly
            </p>
          </div>
        )}

        <p className="text-green-700 dark:text-green-400 text-sm font-medium mb-6 mt-3">
          7-day free trial · Card required · Cancel anytime before it ends
        </p>

        {isActive ? (
          <div className="w-full bg-elevated border border-line-strong rounded-xl py-4 text-center text-muted font-medium text-sm mb-6">
            ✓ You&apos;re already subscribed
          </div>
        ) : (
          <>
            <CheckoutButton isLoggedIn={isLoggedIn} plan={billing} tier={tier} signupQuery={signupQuery} />
            {!isLoggedIn && (
              <p className="text-center text-sm text-subtle -mt-4 mb-6">
                Already have an account?{' '}
                <Link href="/login" className="text-muted hover:text-content transition-colors underline underline-offset-2">
                  Sign in
                </Link>
              </p>
            )}
          </>
        )}

        <ul className="space-y-3">
          {features.map(f => (
            <li key={f} className="flex items-start gap-3 text-sm">
              <span className="text-green-700 mt-0.5 shrink-0">✓</span>
              <span className="text-muted">{f}</span>
            </li>
          ))}
        </ul>
      </div>
    </>
  )
}
