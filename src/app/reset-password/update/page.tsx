'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
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

export default function UpdatePasswordPage() {
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState(false)
  // The connection dropped mid-update — the change may still have committed server-side
  // (a lost *response* looks identical to a lost request on the client), so we can't claim
  // failure. Guide the user to try their new password rather than showing a raw "Load failed".
  const [networkUncertain, setNetworkUncertain] = useState(false)
  // null = still checking; false = no recovery session (expired/direct visit); true = ready.
  const [hasSession, setHasSession] = useState<boolean | null>(null)
  const router = useRouter()
  const supabase = createClient()

  // The recovery link routes through /auth/callback, which exchanges the code for a session
  // before forwarding here — so a valid arrival has a session. No session = link was already
  // used, expired, or the page was opened directly.
  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setHasSession(!!data.user))
  }, [supabase])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    if (password.length < 8) { setError('Use at least 8 characters.'); return }
    if (password !== confirm) { setError('Passwords don\'t match.'); return }

    setLoading(true)
    const { error } = await supabase.auth.updateUser({ password })
    if (error) {
      // A network-level failure (dropped Wi-Fi/cell, the iOS Safari "Load failed" TypeError)
      // is NOT proof the password didn't change — the request can reach the server and commit
      // while the response is lost on the way back. Treat it as uncertain, not failed.
      const isNetwork =
        error.name === 'AuthRetryableFetchError' ||
        /load failed|failed to fetch|network\s?request failed|networkerror/i.test(error.message)
      if (isNetwork) {
        setNetworkUncertain(true)
        setLoading(false)
        return
      }
      setError(error.message)
      setLoading(false)
      return
    }
    // Sign out the one-time recovery session and send the user to /login to sign in with
    // their new password. Routing to /dashboard bounced a no-subscription user to /pricing
    // (the access gate) — confusing right after a reset. A clean re-login confirms the new
    // password works and lands everyone in a predictable place.
    await supabase.auth.signOut()
    setDone(true)
    setLoading(false)
    setTimeout(() => router.push('/login?reset=1'), 1500)
  }

  return (
    <div className="min-h-screen bg-surface flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <div className="flex justify-center mb-3"><LeafLogo /></div>
          <h1 className="text-2xl font-bold text-content tracking-tight">Cultivate</h1>
          <p className="text-subtle text-sm mt-1">Choose a new password</p>
        </div>

        <div className="bg-card border border-line rounded-2xl p-6">
          {done ? (
            <div className="text-center">
              <div className="text-4xl mb-3">✓</div>
              <h2 className="text-base font-semibold mb-2 text-muted">Password updated</h2>
              <p className="text-muted text-sm">Taking you to sign in…</p>
            </div>
          ) : networkUncertain ? (
            <div className="text-center">
              <div className="text-4xl mb-3">📶</div>
              <h2 className="text-base font-semibold mb-2 text-muted">Your connection dropped</h2>
              <p className="text-muted text-sm mb-4">
                We couldn&apos;t confirm the change because the connection cut out — but your new
                password may already be saved. Try signing in with it.
              </p>
              <Link
                href="/login?reset=1"
                className="inline-block w-full py-2.5 px-4 bg-gradient-to-r from-green-700 to-green-600 hover:from-green-600 hover:to-green-500 text-white font-semibold rounded-lg transition-all shadow-lg shadow-green-900/30 mb-3"
              >
                Go to sign in
              </Link>
              <p className="text-subtle text-sm">
                Still not working?{' '}
                <Link href="/reset-password" className="text-green-700 hover:text-green-600 dark:hover:text-green-700 dark:text-green-400 font-medium">
                  Request a new reset link
                </Link>
              </p>
            </div>
          ) : hasSession === false ? (
            <div className="text-center">
              <h2 className="text-base font-semibold mb-2 text-muted">This link has expired</h2>
              <p className="text-muted text-sm mb-4">
                Reset links are good for one hour and one use. Request a fresh one.
              </p>
              <Link href="/reset-password" className="text-green-700 hover:text-green-600 dark:hover:text-green-700 dark:text-green-400 font-medium text-sm">
                Send a new reset link
              </Link>
            </div>
          ) : hasSession === null ? (
            <p className="text-subtle text-sm text-center">Checking your link…</p>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-muted mb-1.5" htmlFor="new-password-1">New password</label>
                <input id="new-password-1"
                  type="password" value={password} onChange={e => setPassword(e.target.value)} required
                  className="w-full px-3.5 py-2.5 bg-elevated border border-line-strong rounded-lg text-content placeholder-subtle focus:outline-none focus:border-green-600 focus:ring-1 focus:ring-green-600/30 transition-colors text-sm"
                  placeholder="At least 8 characters"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-muted mb-1.5" htmlFor="confirm-new-password-2">Confirm new password</label>
                <input id="confirm-new-password-2"
                  type="password" value={confirm} onChange={e => setConfirm(e.target.value)} required
                  className="w-full px-3.5 py-2.5 bg-elevated border border-line-strong rounded-lg text-content placeholder-subtle focus:outline-none focus:border-green-600 focus:ring-1 focus:ring-green-600/30 transition-colors text-sm"
                  placeholder="••••••••"
                />
              </div>
              {error && (
                <div className="bg-red-50 dark:bg-red-950/50 border border-red-200 dark:border-red-900/50 rounded-lg px-3.5 py-2.5 text-red-700 dark:text-red-400 text-sm">{error}</div>
              )}
              <button
                type="submit" disabled={loading}
                className="w-full py-2.5 px-4 bg-gradient-to-r from-green-700 to-green-600 hover:from-green-600 hover:to-green-500 disabled:opacity-60 text-white font-semibold rounded-lg transition-all shadow-lg shadow-green-900/30 mt-1"
              >
                {loading ? 'Updating...' : 'Update password'}
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  )
}
