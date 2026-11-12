'use client'

import { useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'

function LeafLogo() {
  return (
    <svg viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-10 h-10">
      <path d="M16 4C16 4 6 10 6 20C6 25.523 10.477 30 16 30C21.523 30 26 25.523 26 20C26 10 16 4 16 4Z" fill="url(#leafGradS)" />
      <path d="M16 4C16 4 6 10 6 20" stroke="#4ade80" strokeWidth="1" strokeLinecap="round" opacity="0.4" />
      <path d="M16 30L16 12" stroke="#052e16" strokeWidth="1.5" strokeLinecap="round" opacity="0.5" />
      <defs>
        <linearGradient id="leafGradS" x1="16" y1="4" x2="16" y2="30" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#4ade80" />
          <stop offset="100%" stopColor="#15803d" />
        </linearGradient>
      </defs>
    </svg>
  )
}

function EyeIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5" aria-hidden="true">
      <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  )
}

function EyeOffIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5" aria-hidden="true">
      <path d="M3 3l18 18" />
      <path d="M10.6 10.6a3 3 0 0 0 4.2 4.2" />
      <path d="M9.9 4.2A10.4 10.4 0 0 1 12 4c6.5 0 10 7 10 7a13.5 13.5 0 0 1-2.9 3.6" />
      <path d="M6.6 6.6C3.6 8.3 2 12 2 12s3.5 7 10 7a10.4 10.4 0 0 0 2.1-.2" />
    </svg>
  )
}

export default function SignupPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showPw, setShowPw] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)
  const [loading, setLoading] = useState(false)
  const supabase = createClient()

  async function handleSignup(e: React.FormEvent) {
    e.preventDefault()
    setError(null)

    // Guard: passwords must match before we create the account (belt; the submit button is
    // also disabled until they match).
    if (password !== confirmPassword) {
      setError('Passwords do not match.')
      return
    }

    setLoading(true)

    // Acquisition attribution — carried in from the marketing front door
    // (?source=<channel>&state=<abbr>) so trial→paid can be read per channel.
    const params = new URLSearchParams(window.location.search)
    const signup_source = params.get('source') || 'direct'
    const signup_state = params.get('state') || null

    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        // /auth/confirm (verifyOtp + token_hash) works no matter which browser opens the
        // email; /auth/callback (PKCE) only worked in the browser that started signup, so
        // every confirmation click from a mail app dumped the user on /login. The route
        // also accepts ?code=, so this is safe whether or not the Supabase "Confirm signup"
        // email template has been switched to {{ .TokenHash }} yet.
        emailRedirectTo: `${window.location.origin}/auth/confirm`,
        data: {
          signup_source,
          ...(signup_state ? { signup_state } : {}),
        },
      },
    })

    if (error) {
      setError(error.message)
      setLoading(false)
    } else {
      setSuccess(true)
    }
  }

  if (success) {
    return (
      <div className="min-h-screen bg-surface flex items-center justify-center px-4">
        <div className="text-center max-w-sm">
          <div className="w-14 h-14 rounded-2xl bg-green-900/30 flex items-center justify-center text-3xl mx-auto mb-4">✉️</div>
          <h1 className="text-xl font-bold text-content mb-2">Check your email</h1>
          <p className="text-muted text-sm">
            We sent a confirmation link to <span className="text-muted">{email}</span>. Click it to activate your account and start your 7-day free trial.
          </p>
          <div className="mt-5 rounded-xl border border-line bg-card px-4 py-3 text-left">
            <p className="text-muted text-sm">
              <span className="mr-1">📬</span> <span className="font-medium text-muted">Don&apos;t see it?</span> Check your spam or junk folder — and mark it <span className="font-medium text-muted">&ldquo;Not Spam&rdquo;</span> so the rest of your Cultivate emails land in your inbox.
            </p>
          </div>
        </div>
      </div>
    )
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
          <div className="mb-5">
            <h2 className="text-base font-semibold text-muted">Create your account</h2>
            <p className="text-subtle text-xs mt-0.5">7-day free trial · Cancel anytime before it ends</p>
          </div>

          <form onSubmit={handleSignup} className="space-y-4">
            <div>
              <label htmlFor="signup-email" className="block text-sm font-medium text-muted mb-1.5">Email</label>
              <input
                id="signup-email"
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                required
                className="w-full px-3.5 py-2.5 bg-elevated border border-line-strong rounded-lg text-content placeholder-subtle focus:outline-none focus:border-green-600 focus:ring-1 focus:ring-green-600/30 transition-colors text-sm"
                placeholder="you@example.com"
              />
            </div>

            <div>
              <label htmlFor="signup-password" className="block text-sm font-medium text-muted mb-1.5">Password</label>
              <div className="relative">
                <input
                  id="signup-password"
                  type={showPw ? 'text' : 'password'}
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  required
                  minLength={8}
                  className="w-full px-3.5 py-2.5 pr-11 bg-elevated border border-line-strong rounded-lg text-content placeholder-subtle focus:outline-none focus:border-green-600 focus:ring-1 focus:ring-green-600/30 transition-colors text-sm"
                  placeholder="••••••••"
                />
                <button
                  type="button"
                  onClick={() => setShowPw(v => !v)}
                  aria-label={showPw ? 'Hide password' : 'Show password'}
                  aria-pressed={showPw}
                  className="absolute inset-y-0 right-0 flex items-center pr-3 text-subtle hover:text-content focus:outline-none focus:text-muted transition-colors"
                >
                  {showPw ? <EyeOffIcon /> : <EyeIcon />}
                </button>
              </div>
              <p className="text-subtle text-xs mt-1">Minimum 8 characters</p>
            </div>

            <div>
              <label htmlFor="signup-confirm" className="block text-sm font-medium text-muted mb-1.5">Confirm password</label>
              <input
                id="signup-confirm"
                type={showPw ? 'text' : 'password'}
                value={confirmPassword}
                onChange={e => setConfirmPassword(e.target.value)}
                required
                minLength={8}
                aria-invalid={confirmPassword.length > 0 && password !== confirmPassword}
                className="w-full px-3.5 py-2.5 bg-elevated border border-line-strong rounded-lg text-content placeholder-subtle focus:outline-none focus:border-green-600 focus:ring-1 focus:ring-green-600/30 transition-colors text-sm"
                placeholder="••••••••"
              />
              {confirmPassword.length > 0 && password !== confirmPassword && (
                <p className="text-amber-700 dark:text-amber-400 text-xs mt-1">Passwords don&apos;t match yet</p>
              )}
            </div>

            {error && (
              <div className="bg-red-50 dark:bg-red-950/50 border border-red-200 dark:border-red-900/50 rounded-lg px-3.5 py-2.5 text-red-700 dark:text-red-400 text-sm">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading || password.length < 8 || password !== confirmPassword}
              className="w-full py-2.5 px-4 bg-gradient-to-r from-green-700 to-green-600 hover:from-green-600 hover:to-green-500 disabled:opacity-60 disabled:cursor-not-allowed text-white font-semibold rounded-lg transition-all shadow-lg shadow-green-900/30 mt-1"
            >
              {loading ? 'Creating account...' : 'Start free trial'}
            </button>
          </form>
        </div>

        <p className="text-center text-subtle text-sm mt-5">
          Already have an account?{' '}
          <Link href="/login" className="text-green-700 hover:text-green-600 dark:hover:text-green-700 dark:text-green-400 font-medium transition-colors">
            Sign in
          </Link>
        </p>
      </div>
    </div>
  )
}
