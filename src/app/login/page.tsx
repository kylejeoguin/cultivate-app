'use client'

import { Suspense, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
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

// `useSearchParams()` opts its nearest Suspense boundary out of prerendering, so anything
// under that boundary ships as an EMPTY fallback and only exists after hydration. When this
// hook lived in LoginForm, the whole sign-in form was that "anything": /login server-rendered
// a blank dark <div>, and a user with slow or blocked JS saw nothing at all. Keep the hook
// isolated in this leaf, behind its own Suspense, so only the notice defers — never the form.
function ResetNotice() {
  // Set by the password-reset flow after a successful update, to confirm the change.
  const justReset = useSearchParams().get('reset') === '1'
  if (!justReset) return null
  return (
    <div className="bg-green-50 dark:bg-green-950/50 border border-green-200 dark:border-green-900/50 rounded-lg px-3.5 py-2.5 text-green-700 dark:text-green-400 text-sm mb-4">
      Password updated. Sign in with your new password.
    </div>
  )
}

function LoginForm() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const router = useRouter()
  const supabase = createClient()

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError(null)

    const { error } = await supabase.auth.signInWithPassword({ email, password })

    if (error) {
      setError(error.message)
      setLoading(false)
    } else {
      router.push('/dashboard')
    }
  }

  return (
    <div className="min-h-screen bg-surface flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        {/* Brand header */}
        <div className="text-center mb-8">
          <div className="flex justify-center mb-3">
            <LeafLogo />
          </div>
          <h1 className="text-2xl font-bold text-content tracking-tight">Cultivate</h1>
          <p className="text-subtle text-sm mt-1">Your homeschool, garden, and home in one place</p>
        </div>

        {/* Form card */}
        <div className="bg-card border border-line rounded-2xl p-6">
          <h2 className="text-base font-semibold mb-5 text-muted">Sign in to your account</h2>

          <Suspense fallback={null}>
            <ResetNotice />
          </Suspense>

          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label htmlFor="login-email" className="block text-sm font-medium text-muted mb-1.5">Email</label>
              <input
                id="login-email"
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                required
                className="w-full px-3.5 py-2.5 bg-elevated border border-line-strong rounded-lg text-content placeholder-subtle focus:outline-none focus:border-green-600 focus:ring-1 focus:ring-green-600/30 transition-colors text-sm"
                placeholder="you@example.com"
              />
            </div>

            <div>
              <label htmlFor="login-password" className="block text-sm font-medium text-muted mb-1.5">Password</label>
              <input
                id="login-password"
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                required
                className="w-full px-3.5 py-2.5 bg-elevated border border-line-strong rounded-lg text-content placeholder-subtle focus:outline-none focus:border-green-600 focus:ring-1 focus:ring-green-600/30 transition-colors text-sm"
                placeholder="••••••••"
              />
              <div className="text-right mt-1.5">
                <Link href="/reset-password" className="text-xs text-subtle hover:text-green-600 dark:hover:text-green-700 dark:text-green-400 transition-colors">
                  Forgot password?
                </Link>
              </div>
            </div>

            {error && (
              <div className="bg-red-50 dark:bg-red-950/50 border border-red-200 dark:border-red-900/50 rounded-lg px-3.5 py-2.5 text-red-700 dark:text-red-400 text-sm">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full py-2.5 px-4 bg-gradient-to-r from-green-700 to-green-600 hover:from-green-600 hover:to-green-500 disabled:opacity-60 text-white font-semibold rounded-lg transition-all shadow-lg shadow-green-900/30 mt-1"
            >
              {loading ? 'Signing in...' : 'Sign in'}
            </button>
          </form>
        </div>

        <p className="text-center text-subtle text-sm mt-5">
          Don&apos;t have an account?{' '}
          <Link href="/signup" className="text-green-700 hover:text-green-600 dark:hover:text-green-700 dark:text-green-400 font-medium transition-colors">
            Start your free trial
          </Link>
        </p>
      </div>
    </div>
  )
}

// No Suspense wrapper here on purpose: LoginForm no longer reads search params, so it
// prerenders. The only deferred thing is <ResetNotice />, behind its own boundary above.
export default function LoginPage() {
  return <LoginForm />
}
