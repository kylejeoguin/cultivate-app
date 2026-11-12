'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'

export default function DeleteLogButton({ logId }: { logId: string }) {
  const [confirming, setConfirming] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const router = useRouter()
  const supabase = createClient()

  async function handleDelete() {
    setDeleting(true)
    await supabase.from('daily_log').delete().eq('id', logId)
    router.refresh()
  }

  if (confirming) {
    return (
      <div className="flex items-center gap-2">
        <button
          onClick={handleDelete}
          disabled={deleting}
          className="text-xs text-red-600 dark:text-red-400 hover:text-red-700 dark:hover:text-red-300 font-medium transition-colors"
        >
          {deleting ? 'Deleting...' : 'Delete'}
        </button>
        <button
          onClick={() => setConfirming(false)}
          className="text-xs text-subtle hover:text-muted transition-colors"
        >
          Cancel
        </button>
      </div>
    )
  }

  return (
    <button
      onClick={() => setConfirming(true)}
      className="text-xs text-subtle hover:text-subtle transition-colors opacity-0 group-hover:opacity-100"
      aria-label="Delete log entry"
    >
      ✕
    </button>
  )
}
