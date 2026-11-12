'use client'

import { useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'

function LeafLogo() {
  return (
    <svg viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-10 h-10">
      <path d="M16 4C16 4 6 10 6 20C6 25.523 10.477 30 16 30C21.523 30 26 25.523 26 20C26 10 16 4 16 4Z" fill="url(#leafGrad)" />
      <path d="M16 4C16 4 6 10 6 20" stroke="#4ade80" strokeWidth="1" strokeLinecap="round" opacity="0.4" />
      <path d="M16 30L16 12" stroke="#052e16" strokeWidth="1.5" strokeLinecap="round" opacity="0.5" />
      <defs>
        <linearGradient id="leafGrad" x1="16" y1="4" x2="16" y2="30" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#4ade80" />
          <stop offset="100%" stopColor="#15803d" />
        </linearGradient>
      </defs>
    </svg>
  )
}

export default function ResetPasswordPage() {
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [sent, setSent] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const supabase = createClient()

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError(null)

    // Recovery link lands on /auth/callback, which exchanges the code for a session and
    // forwards to /reset-password/update where the user sets a new password.
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/auth/callback?next=/reset-password/update`,
    })

    // Always show success (don't reveal whether an account exists — avoids email enumeration).
    if (error && !/rate|limit/i.test(error.message)) {
      console.error('resetPasswordForEmail:', error.message)
    }
    setSent(true)
    setLoading(false)
  }

  return (
    <div className="min-h-screen bg-surface flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <div className="flex justify-center mb-3"><LeafLogo /></div>
          <h1 className="text-2xl font-bold text-content tracking-tight">Cultivate</h1>
          <p className="text-subtle text-sm mt-1">Reset your password</p>
        </div>

        <div className="bg-card border border-line rounded-2xl p-6">
          {sent ? (
            <div className="text-center">
              <div className="text-4xl mb-3">📬</div>
              <h2 className="text-base font-semibold mb-2 text-muted">Check your email</h2>
              <p className="text-muted text-sm">
                If an account exists for <span className="text-muted">{email}</span>, we&apos;ve sent a link to
                reset your password. It expires in an hour — check spam if you don&apos;t see it.
              </p>
            </div>
          ) : (
            <>
              <h2 className="text-base font-semibold mb-2 text-muted">Forgot your password?</h2>
              <p className="text-subtle text-sm mb-5">Enter your email and we&apos;ll send you a reset link.</p>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-muted mb-1.5" htmlFor="email-1">Email</label>
                  <input id="email-1"
                    type="email" value={email} onChange={e => setEmail(e.target.value)} required
                    className="w-full px-3.5 py-2.5 bg-elevated border border-line-strong rounded-lg text-content placeholder-subtle focus:outline-none focus:border-green-600 focus:ring-1 focus:ring-green-600/30 transition-colors text-sm"
                    placeholder="you@example.com"
                  />
                </div>
                {error && (
                  <div className="bg-red-50 dark:bg-red-950/50 border border-red-200 dark:border-red-900/50 rounded-lg px-3.5 py-2.5 text-red-700 dark:text-red-400 text-sm">{error}</div>
                )}
                <button
                  type="submit" disabled={loading}
                  className="w-full py-2.5 px-4 bg-gradient-to-r from-green-700 to-green-600 hover:from-green-600 hover:to-green-500 disabled:opacity-60 text-white font-semibold rounded-lg transition-all shadow-lg shadow-green-900/30 mt-1"
                >
                  {loading ? 'Sending...' : 'Send reset link'}
                </button>
              </form>
            </>
          )}
        </div>

        <p className="text-center text-subtle text-sm mt-5">
          <Link href="/login" className="text-green-700 hover:text-green-600 dark:hover:text-green-700 dark:text-green-400 font-medium transition-colors">
            ← Back to sign in
          </Link>
        </p>
      </div>
    </div>
  )
}
