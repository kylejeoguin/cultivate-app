'use client'

import { useState } from 'react'
import Link from 'next/link'
import { unitOptions } from '@/lib/units'

const ADD_SENTINEL = '__add_unit__'

// Reusable unit picker: built-in units for the context + the user's own custom units +
// a "＋ Add unit type…" row. Adding persists via the parent's onAddCustom (writes to
// custom_units, GLOBAL to the user) and selects the new unit. The parent owns the
// customUnits list + selected value so a unit added in one dropdown appears in all of
// them. Deletion lives in Account → Manage units (linked here when manageHref is given).
export default function UnitSelect({
  value,
  onChange,
  options,
  customUnits,
  onAddCustom,
  id,
  className = 'w-full bg-elevated border border-line-strong rounded-lg px-3 py-2 text-content text-sm focus:outline-none focus:border-amber-600',
  manageHref,
}: {
  value: string
  onChange: (unit: string) => void
  options: string[]
  customUnits: string[]
  onAddCustom: (unit: string) => Promise<void> | void
  id?: string
  className?: string
  manageHref?: string
}) {
  const [adding, setAdding] = useState(false)
  const [draft, setDraft] = useState('')
  const [busy, setBusy] = useState(false)

  const opts = unitOptions(options, customUnits, value)

  async function commit() {
    const u = draft.trim()
    if (!u) { setAdding(false); setDraft(''); return }
    // Already known (case-insensitive)? Just select it — never duplicate.
    const existing = opts.find(o => o.toLowerCase() === u.toLowerCase())
    if (existing) { onChange(existing); setAdding(false); setDraft(''); return }
    setBusy(true)
    try {
      await onAddCustom(u)
      onChange(u)
    } finally {
      setBusy(false)
      setAdding(false)
      setDraft('')
    }
  }

  if (adding) {
    return (
      <div className="flex items-center gap-1.5">
        <input
          type="text"
          autoFocus
          value={draft}
          onChange={e => setDraft(e.target.value)}
          onKeyDown={e => {
            if (e.key === 'Enter') { e.preventDefault(); commit() }
            if (e.key === 'Escape') { setAdding(false); setDraft('') }
          }}
          maxLength={30}
          placeholder="New unit (e.g. bushels)"
          className={className}
        />
        <button type="button" onClick={commit} disabled={busy}
          className="shrink-0 text-xs font-medium text-green-700 dark:text-green-400 hover:underline disabled:opacity-50">
          {busy ? '…' : 'Add'}
        </button>
        <button type="button" onClick={() => { setAdding(false); setDraft('') }}
          className="shrink-0 text-xs text-subtle hover:text-content">
          Cancel
        </button>
      </div>
    )
  }

  return (
    <div className="flex items-center gap-2">
      <select
        id={id}
        value={value}
        onChange={e => {
          if (e.target.value === ADD_SENTINEL) { setAdding(true); return }
          onChange(e.target.value)
        }}
        className={className}
      >
        {!value && <option value="" disabled>Select unit…</option>}
        {opts.map(u => (
          <option key={u} value={u} className="bg-card text-content">{u}</option>
        ))}
        <option value={ADD_SENTINEL} className="bg-card text-content">＋ Add unit type…</option>
      </select>
      {manageHref && (
        <Link href={manageHref} className="shrink-0 text-[11px] text-subtle hover:text-content whitespace-nowrap">
          Manage
        </Link>
      )}
    </div>
  )
}
