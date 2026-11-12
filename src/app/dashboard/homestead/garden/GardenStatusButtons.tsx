'use client'

import { todayLocalISO } from '@/lib/use-today'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

const NEXT_STATUS: Record<string, string> = {
  planned: 'planted',
  planted: 'growing',
  growing: 'harvested',
}

const NEXT_LABEL: Record<string, string> = {
  planned: 'Mark Planted',
  planted: 'Mark Growing',
  growing: 'Mark Harvested',
}

const ALL_STATUSES = ['planned', 'planted', 'growing', 'harvested', 'failed'] as const
const STATUS_LABELS: Record<string, string> = {
  planned: 'Planned',
  planted: 'Planted',
  growing: 'Growing',
  harvested: 'Harvested',
  failed: 'Failed',
}

export default function GardenStatusButtons({ id, status }: { id: string; status: string }) {
  const router = useRouter()
  const supabase = createClient()
  const [saving, setSaving] = useState(false)
  const [confirmFail, setConfirmFail] = useState(false)
  const [editingStatus, setEditingStatus] = useState(false)

  async function advance() {
    const next = NEXT_STATUS[status]
    if (!next) return
    setSaving(true)
    const updates: Record<string, unknown> = { status: next }
    if (next === 'harvested') {
      updates.actual_harvest = todayLocalISO()
    }
    await supabase.from('garden_entries').update(updates).eq('id', id)
    router.refresh()
    setSaving(false)
  }

  async function markFailed() {
    setSaving(true)
    await supabase.from('garden_entries').update({ status: 'failed' }).eq('id', id)
    router.refresh()
    setSaving(false)
    setConfirmFail(false)
  }

  async function changeStatus(newStatus: string) {
    setSaving(true)
    const updates: Record<string, unknown> = { status: newStatus }
    if (newStatus === 'harvested') {
      updates.actual_harvest = todayLocalISO()
    }
    if (newStatus !== 'harvested') {
      updates.actual_harvest = null
    }
    await supabase.from('garden_entries').update(updates).eq('id', id)
    router.refresh()
    setSaving(false)
    setEditingStatus(false)
  }

  const hasAdvance = !!NEXT_STATUS[status]
  const isTerminal = status === 'harvested' || status === 'failed'

  return (
    <div className="mt-2.5 pt-2.5 border-t border-line/60">
      {/* Status override for terminal entries */}
      {isTerminal && (
        <div>
          {editingStatus ? (
            <div className="flex flex-wrap gap-2 items-center">
              <span className="text-xs text-subtle">Change to:</span>
              {ALL_STATUSES.filter(s => s !== status).map(s => (
                <button
                  key={s}
                  onClick={() => changeStatus(s)}
                  disabled={saving}
                  className="text-xs bg-elevated hover:bg-line-strong text-content hover:text-content px-2.5 py-1 rounded-lg transition-colors disabled:opacity-50"
                >
                  {STATUS_LABELS[s]}
                </button>
              ))}
              <button
                onClick={() => setEditingStatus(false)}
                className="text-xs text-subtle hover:text-muted px-2 py-1 rounded-lg transition-colors"
              >
                Cancel
              </button>
            </div>
          ) : (
            <button
              onClick={() => setEditingStatus(true)}
              className="text-xs text-subtle hover:text-muted transition-colors"
            >
              Change status
            </button>
          )}
        </div>
      )}

      {/* Forward advance + failed for active entries */}
      {!isTerminal && (
        <div className="flex items-center gap-2">
          {hasAdvance && (
            <button
              onClick={advance}
              disabled={saving}
              className="text-xs bg-green-100 dark:bg-green-900/40 hover:bg-green-200 dark:hover:bg-green-900/70 text-green-700 dark:text-green-400 hover:text-green-800 dark:hover:text-green-300 px-3 py-1.5 rounded-lg transition-colors font-medium disabled:opacity-50"
            >
              {saving ? '...' : NEXT_LABEL[status]}
            </button>
          )}

          {/* Two-step failed confirmation */}
          {!confirmFail ? (
            <button
              onClick={() => setConfirmFail(true)}
              disabled={saving}
              className="text-xs text-subtle hover:text-red-600 dark:hover:text-red-400 px-2 py-1.5 rounded-lg transition-colors disabled:opacity-50"
            >
              Failed
            </button>
          ) : (
            <div className="flex items-center gap-1.5">
              <span className="text-xs text-red-600 dark:text-red-400">Mark as failed?</span>
              <button
                onClick={markFailed}
                disabled={saving}
                className="text-xs bg-red-100 dark:bg-red-900/40 hover:bg-red-200 dark:hover:bg-red-900/60 text-red-700 dark:text-red-400 px-2.5 py-1 rounded-lg transition-colors font-medium disabled:opacity-50"
              >
                Yes
              </button>
              <button
                onClick={() => setConfirmFail(false)}
                className="text-xs text-subtle hover:text-content px-2 py-1 rounded-lg transition-colors"
              >
                Cancel
              </button>
            </div>
          )}

          {/* Always-available status override */}
          {editingStatus ? (
            <div className="flex flex-wrap gap-1.5 items-center ml-1">
              {ALL_STATUSES.filter(s => s !== status).map(s => (
                <button
                  key={s}
                  onClick={() => changeStatus(s)}
                  disabled={saving}
                  className="text-xs bg-elevated hover:bg-line-strong text-content hover:text-content px-2 py-1 rounded-lg transition-colors disabled:opacity-50"
                >
                  {STATUS_LABELS[s]}
                </button>
              ))}
              <button onClick={() => setEditingStatus(false)} className="text-xs text-subtle hover:text-muted px-1.5 py-1 transition-colors">✕</button>
            </div>
          ) : (
            <button
              onClick={() => setEditingStatus(true)}
              className="text-xs text-subtle hover:text-subtle ml-auto transition-colors"
            >
              edit
            </button>
          )}
        </div>
      )}
    </div>
  )
}
