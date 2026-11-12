'use client'

import { useState, useEffect, Suspense } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import type { User } from '@supabase/supabase-js'

export default function InvitePage() {
  return (
    <Suspense fallback={<InviteShell><p className="text-muted text-sm">Checking invite...</p></InviteShell>}>
      <InviteContent />
    </Suspense>
  )
}

function InviteContent() {
  const params = useSearchParams()
  const router = useRouter()
  const supabase = createClient()
  const token = params.get('token')

  const [user, setUser] = useState<User | null>(null)
  const [checking, setChecking] = useState(true)
  const [accepting, setAccepting] = useState(false)
  const [error, setError] = useState('')
  const [done, setDone] = useState(false)

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      setUser(data.user)
      setChecking(false)
    })
  }, [])

  async function handleAccept() {
    if (!token) return
    setAccepting(true)
    setError('')

    const res = await fetch('/api/family/accept', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token }),
    })
    const data = await res.json()

    if (data.success) {
      setDone(true)
      setTimeout(() => router.push('/dashboard'), 2000)
    } else {
      setError(data.error ?? 'Something went wrong. Please try again.')
      setAccepting(false)
    }
  }

  if (!token) {
    return <InviteShell><p className="text-muted text-sm">Invalid invite link.</p></InviteShell>
  }

  if (checking) {
    return <InviteShell><p className="text-muted text-sm">Checking invite...</p></InviteShell>
  }

  if (done) {
    return (
      <InviteShell>
        <div className="text-4xl mb-4">🎉</div>
        <h2 className="text-lg font-bold mb-2">You&apos;re in!</h2>
        <p className="text-muted text-sm">Taking you to the dashboard...</p>
      </InviteShell>
    )
  }

  if (!user) {
    // Not logged in — send them to sign up with the token preserved
    return (
      <InviteShell>
        <div className="text-4xl mb-4">🌱</div>
        <h2 className="text-xl font-bold mb-2 tracking-tight">You&apos;ve been invited to Cultivate</h2>
        <p className="text-muted text-sm mb-8 leading-relaxed">
          Create your account to join your family&apos;s Cultivate subscription.
        </p>
        <Link
          href={`/signup?invite=${token}`}
          className="block w-full py-3 bg-green-700 hover:bg-green-600 text-white font-bold rounded-xl transition-colors text-center mb-3"
        >
          Create Account
        </Link>
        <Link
          href={`/login?invite=${token}`}
          className="block w-full py-3 bg-elevated hover:bg-line-strong text-content font-semibold rounded-xl transition-colors text-center text-sm"
        >
          Already have an account? Sign in
        </Link>
      </InviteShell>
    )
  }

  return (
    <InviteShell>
      <div className="text-4xl mb-4">🌱</div>
      <h2 className="text-xl font-bold mb-2 tracking-tight">Join your family on Cultivate</h2>
      <p className="text-muted text-sm mb-8 leading-relaxed">
        You&apos;re signed in as <span className="text-content font-medium">{user.email}</span>.
        Click below to accept the invite and get full access to your family&apos;s account.
      </p>
      {error && <p className="text-red-700 dark:text-red-400 text-sm mb-4">{error}</p>}
      <button
        onClick={handleAccept}
        disabled={accepting}
        className="w-full py-3 bg-green-700 hover:bg-green-600 disabled:opacity-50 text-white font-bold rounded-xl transition-colors"
      >
        {accepting ? 'Accepting...' : 'Accept Invite'}
      </button>
    </InviteShell>
  )
}

function InviteShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-surface text-content flex items-center justify-center px-6">
      <div className="w-full max-w-sm bg-card border border-line rounded-2xl p-8 text-center">
        <div className="flex items-center justify-center gap-2 mb-8">
          <span className="text-lg font-bold tracking-tight text-green-700 dark:text-green-400">Cultivate</span>
        </div>
        {children}
      </div>
    </div>
  )
}
