'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import type { EquipmentMaintenance } from '@/lib/types'
import EquipmentForm from './EquipmentForm'

export default function EquipmentActions({ equipment }: { equipment: EquipmentMaintenance }) {
  const id = equipment.id
  const isActive = equipment.is_active ?? true

  const router = useRouter()
  const supabase = createClient()
  const [saving, setSaving] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [editing, setEditing] = useState(false)

  async function toggleActive() {
    setSaving(true)
    await supabase.from('equipment_maintenance').update({ is_active: !isActive }).eq('id', id)
    router.refresh()
    setSaving(false)
  }

  async function handleDelete() {
    setSaving(true)
    await supabase.from('equipment_maintenance').delete().eq('id', id)
    router.refresh()
    setSaving(false)
    setConfirmDelete(false)
  }

  if (editing) {
    return (
      <div className="mt-2.5 pt-2.5 border-t border-line/60">
        <EquipmentForm equipment={equipment} onClose={() => setEditing(false)} />
      </div>
    )
  }

  return (
    <div className="mt-2.5 pt-2.5 border-t border-line/60 flex items-center gap-2 flex-wrap">
      <button
        onClick={() => setEditing(true)}
        disabled={saving}
        className="text-xs text-subtle hover:text-content px-2 py-1.5 rounded-lg transition-colors disabled:opacity-50"
      >
        Edit
      </button>

      <button
        onClick={toggleActive}
        disabled={saving}
        className="text-xs text-subtle hover:text-muted px-2 py-1.5 rounded-lg transition-colors disabled:opacity-50"
      >
        {isActive ? 'Deactivate' : 'Reactivate'}
      </button>

      {!confirmDelete ? (
        <button
          onClick={() => setConfirmDelete(true)}
          disabled={saving}
          className="text-xs text-subtle hover:text-red-600 dark:hover:text-red-400 px-2 py-1.5 rounded-lg transition-colors ml-auto disabled:opacity-50"
        >
          Delete
        </button>
      ) : (
        <div className="flex items-center gap-1.5 ml-auto">
          <span className="text-xs text-red-600 dark:text-red-400">Delete this equipment?</span>
          <button
            onClick={handleDelete}
            disabled={saving}
            className="text-xs bg-red-100 dark:bg-red-900/40 hover:bg-red-200 dark:hover:bg-red-900/60 text-red-700 dark:text-red-400 px-2.5 py-1 rounded-lg transition-colors font-medium disabled:opacity-50"
          >
            Yes
          </button>
          <button
            onClick={() => setConfirmDelete(false)}
            className="text-xs text-subtle hover:text-content px-2 py-1 rounded-lg transition-colors"
          >
            Cancel
          </button>
        </div>
      )}
    </div>
  )
}
