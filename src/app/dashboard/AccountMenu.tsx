'use client'

import { useState, useRef, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { disablePush } from '@/lib/push/client'

export default function AccountMenu({ email, createdAt }: { email: string; createdAt: string }) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const router = useRouter()
  const supabase = createClient()

  useEffect(() => {
    function handleOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    if (open) document.addEventListener('mousedown', handleOutside)
    return () => document.removeEventListener('mousedown', handleOutside)
  }, [open])

  async function handleSignOut() {
    // Unregister this device BEFORE the session ends — afterwards RLS can no longer
    // delete its row, and a shared or loaned device would keep getting reminders.
    await disablePush()
    await supabase.auth.signOut()
    router.push('/login')
  }

  const memberSince = new Date(createdAt).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen(o => !o)}
        className="flex items-center gap-1.5 text-subtle hover:text-content text-xs transition-colors"
      >
        <span className="max-w-[180px] truncate">{email}</span>
        <svg width="10" height="10" viewBox="0 0 10 10" fill="none" className={`transition-transform ${open ? 'rotate-180' : ''}`}>
          <path d="M2 3.5L5 6.5L8 3.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-2 w-64 bg-card border border-line rounded-xl shadow-2xl z-50 overflow-hidden">
          <div className="px-4 py-3.5 border-b border-line">
            <p className="text-xs text-subtle mb-0.5">Signed in as</p>
            <p className="text-sm text-stone-200 font-medium truncate">{email}</p>
            <p className="text-xs text-subtle mt-0.5">Member since {memberSince}</p>
          </div>

          <div className="p-2">
            <Link
              href="/dashboard/account"
              onClick={() => setOpen(false)}
              className="flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm text-muted hover:text-content hover:bg-elevated transition-colors"
            >
              <span className="text-base leading-none">⚙️</span>
              Account settings
            </Link>
          </div>

          <div className="px-3 pb-3">
            <button
              onClick={handleSignOut}
              className="w-full py-2 px-3 bg-elevated/60 hover:bg-red-100 dark:hover:bg-red-900/30 border border-line-strong/60 hover:border-red-200 dark:hover:border-red-800/50 text-muted hover:text-red-800 dark:hover:text-red-300 font-medium rounded-lg transition-all text-sm"
            >
              Sign out
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
