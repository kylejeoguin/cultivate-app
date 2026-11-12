'use client'

import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { disablePush } from '@/lib/push/client'

export default function SignOutButton({ inline = false, className }: { inline?: boolean; className?: string }) {
  const router = useRouter()
  const supabase = createClient()

  async function handleSignOut() {
    // Unregister this device BEFORE the session ends — afterwards RLS can no longer
    // delete its row, and a shared or loaned device would keep getting reminders.
    await disablePush()
    await supabase.auth.signOut()
    router.push('/login')
  }

  if (inline) {
    return (
      <button onClick={handleSignOut} className={className ?? 'text-content hover:text-content transition-colors underline underline-offset-2'}>
        Sign out
      </button>
    )
  }

  return (
    <button
      onClick={handleSignOut}
      className="w-full py-2.5 px-4 bg-elevated hover:bg-elevated border border-line-strong hover:border-line-strong text-content hover:text-content font-medium rounded-lg transition-all text-sm"
    >
      Sign out
    </button>
  )
}
