'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'

type CustomUnit = { id: string; unit: string }

// Account → Manage units. Lists the user's own added measurement units with a delete
// each, plus a quick add. Deleting only removes the unit from FUTURE dropdowns — past
// logs keep their stored unit text, so history and reports never change retroactively.
export default function UnitsManager({ initialUnits }: { initialUnits: CustomUnit[] }) {
  const [units, setUnits] = useState<CustomUnit[]>(initialUnits)
  const [draft, setDraft] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const supabase = createClient()

  async function add() {
    const u = draft.trim()
    if (!u) return
    if (units.some(x => x.unit.toLowerCase() === u.toLowerCase())) { setDraft(''); return }
    setBusy(true); setError('')
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setBusy(false); return }
    const { data, error: err } = await supabase
      .from('custom_units').insert({ user_id: user.id, unit: u }).select('id, unit').single()
    if (err) { setError(err.message); setBusy(false); return }
    setUnits(prev => [...prev, data as CustomUnit])
    setDraft('')
    setBusy(false)
  }

  async function remove(id: string) {
    setError('')
    const prev = units
    setUnits(u => u.filter(x => x.id !== id)) // optimistic
    const { error: err } = await supabase.from('custom_units').delete().eq('id', id)
    if (err) { setError(err.message); setUnits(prev) } // roll back on failure
  }

  return (
    <div className="space-y-3">
      {units.length === 0 ? (
        <p className="text-sm text-subtle">No custom units yet. The log forms already include the common ones — add any of your own here (or with “＋ Add unit type…” in a unit dropdown).</p>
      ) : (
        <div className="flex flex-wrap gap-2">
          {units.map(u => (
            <span key={u.id} className="inline-flex items-center gap-1.5 bg-elevated border border-line-strong rounded-full pl-3 pr-1.5 py-1 text-sm text-content">
              {u.unit}
              <button
                type="button"
                onClick={() => remove(u.id)}
                aria-label={`Delete unit ${u.unit}`}
                className="w-5 h-5 rounded-full text-subtle hover:text-red-500 hover:bg-red-500/10 flex items-center justify-center transition-colors"
              >
                ✕
              </button>
            </span>
          ))}
        </div>
      )}

      <div className="flex items-center gap-2">
        <input
          type="text"
          value={draft}
          onChange={e => setDraft(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); add() } }}
          maxLength={30}
          placeholder="Add a unit (e.g. bushels)"
          className="flex-1 bg-card border border-line-strong h-9 rounded-lg px-3 text-sm text-content placeholder-subtle focus:outline-none focus:border-green-600"
        />
        <button
          type="button"
          onClick={add}
          disabled={busy || !draft.trim()}
          className="px-4 py-1.5 bg-green-700 hover:bg-green-600 disabled:opacity-50 text-white text-sm font-medium rounded-lg transition-colors"
        >
          {busy ? 'Adding…' : 'Add'}
        </button>
      </div>

      {error && <p className="text-red-500 text-xs">{error}</p>}
      <p className="text-xs text-subtle">Deleting a unit removes it from future dropdowns only — entries you already logged keep their unit.</p>
    </div>
  )
}
