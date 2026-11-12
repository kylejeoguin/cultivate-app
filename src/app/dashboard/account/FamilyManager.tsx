'use client'

import { useState } from 'react'
import type { FamilyMember } from '@/lib/types'

// The list mixes server rows with an optimistic "pending" entry; only these two
// fields are read/rendered, so this is the honest shape (a full row satisfies it).
type MemberRow = Pick<FamilyMember, 'member_email' | 'status'>

export default function FamilyManager({ initialMembers }: { initialMembers: MemberRow[] }) {
  const [members, setMembers] = useState(initialMembers)
  const [email, setEmail] = useState('')
  const [sending, setSending] = useState(false)
  const [inviteUrl, setInviteUrl] = useState('')
  const [error, setError] = useState('')
  const [copied, setCopied] = useState(false)
  const [resent, setResent] = useState(false)
  const [emailed, setEmailed] = useState(false)

  const accepted = members.find(m => m.status === 'accepted')
  const pending = members.find(m => m.status === 'pending')

  // Accepts an explicit address so "Resend" works from the pending view, where the
  // email input isn't rendered and the `email` state is empty.
  async function handleInvite(overrideEmail?: string) {
    const target = (overrideEmail ?? email).trim()
    if (!target) return
    setSending(true)
    setError('')
    setResent(false)
    if (!overrideEmail) setInviteUrl('')

    const res = await fetch('/api/family/invite', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: target }),
    })
    const data = await res.json()

    if (data.inviteUrl) {
      setInviteUrl(data.inviteUrl)
      setEmailed(Boolean(data.emailed))
      setMembers(prev => {
        const filtered = prev.filter(m => m.member_email !== target.toLowerCase())
        return [...filtered, { member_email: target.toLowerCase(), status: 'pending' }]
      })
      if (overrideEmail) {
        setResent(true)
        setTimeout(() => setResent(false), 4000)
      } else {
        setEmail('')
      }
    } else {
      setError(data.error ?? 'Something went wrong.')
    }
    setSending(false)
  }

  async function handleCopy() {
    await navigator.clipboard.writeText(inviteUrl)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="bg-card border border-line rounded-xl p-5 space-y-4">
      <div>
        <p className="text-xs font-semibold text-subtle uppercase tracking-widest mb-1">Family Plan</p>
        <p className="text-xs text-subtle">Invite your partner to access your family&apos;s Cultivate account.</p>
      </div>

      {accepted ? (
        <div className="flex items-center justify-between py-2 px-3 bg-green-50 dark:bg-green-950/40 border border-green-200 dark:border-green-800/40 rounded-lg">
          <div>
            <p className="text-sm font-medium text-green-700 dark:text-green-400">{accepted.member_email}</p>
            <p className="text-xs text-subtle mt-0.5">Active family member</p>
          </div>
          <span className="text-xs bg-green-100 text-green-800 dark:bg-green-900/60 dark:text-green-400 px-2 py-0.5 rounded-full">Active</span>
        </div>
      ) : pending ? (
        <div className="space-y-3">
          <div className="flex items-center justify-between py-2 px-3 bg-elevated/60 border border-line-strong rounded-lg">
            <div>
              <p className="text-sm text-content">{pending.member_email}</p>
              <p className="text-xs text-subtle mt-0.5">Invite pending</p>
            </div>
            <span className="text-xs bg-amber-100 text-amber-800 dark:bg-amber-900/60 dark:text-amber-400 px-2 py-0.5 rounded-full">Pending</span>
          </div>
          <button
            onClick={() => handleInvite(pending.member_email)}
            disabled={sending}
            className="text-xs font-medium text-green-700 dark:text-green-500 hover:text-green-600 disabled:opacity-50 transition-colors"
          >
            {sending ? 'Sending…' : resent ? '✓ Invite resent' : `Resend invite to ${pending.member_email}`}
          </button>
          {error && <p className="text-red-600 dark:text-red-400 text-xs">{error}</p>}
        </div>
      ) : (
        <div className="space-y-3">
          <div className="flex gap-2">
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleInvite()}
              placeholder="Partner's email address"
              className="flex-1 bg-elevated border border-line-strong h-10 rounded-lg px-3 text-content text-sm placeholder-subtle focus:outline-none focus:border-green-600"
            />
            <button
              onClick={() => handleInvite()}
              disabled={sending || !email.trim()}
              className="bg-green-700 hover:bg-green-600 disabled:opacity-50 text-white text-sm font-semibold px-4 h-10 rounded-lg transition-colors shrink-0"
            >
              {sending ? '...' : 'Invite'}
            </button>
          </div>
          {error && <p className="text-red-600 dark:text-red-400 text-xs">{error}</p>}
        </div>
      )}

      {inviteUrl && (
        <div className="border-t border-line pt-4 space-y-2">
          <p className="text-xs text-muted">
            {emailed
              ? 'We emailed the invite. You can also share this link directly:'
              : 'Share this invite link with your partner:'}
          </p>
          <div className="flex gap-2">
            <input
              readOnly
              value={inviteUrl}
              className="flex-1 bg-elevated border border-line-strong h-9 rounded-lg px-3 text-content text-xs focus:outline-none truncate"
            />
            <button
              onClick={handleCopy}
              className="bg-elevated hover:bg-elevated text-content text-xs font-semibold px-3 h-9 rounded-lg transition-colors shrink-0"
            >
              {copied ? 'Copied!' : 'Copy'}
            </button>
          </div>
          <p className="text-xs text-subtle">The link expires when your partner accepts the invite.</p>
        </div>
      )}
    </div>
  )
}
