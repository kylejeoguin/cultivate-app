'use client'

import { useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { formatDateWeekday } from '@/lib/dates'
import type { PreservationLog, PreservationMethod, Child, Subject, HomesteadInput } from '@/lib/types'
import HomesteadInputForm from '../HomesteadInputForm'
import { InputEditCard } from '../livestock/LivestockCards'
import QuickLog from '../QuickLog'
import { preservationQuickLog } from './quickLog'

const METHOD_LABELS: Record<string, string> = {
  canning: 'Canning', freezing: 'Freezing', dehydrating: 'Dehydrating', fermenting: 'Fermenting', other: 'Other',
}
const METHOD_COLORS: Record<string, string> = {
  canning: 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300', freezing: 'bg-sky-100 text-sky-800 dark:bg-sky-900/40 dark:text-sky-300',
  dehydrating: 'bg-orange-100 text-orange-800 dark:bg-orange-900/40 dark:text-orange-300', fermenting: 'bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300', other: 'text-muted bg-elevated',
}
const METHOD_OPTIONS = ['canning', 'freezing', 'dehydrating', 'fermenting', 'other']
const METHOD_UNITS: Record<string, string[]> = {
  canning: ['jars', 'quarts', 'pints', 'half-pints'], freezing: ['lbs', 'bags', 'quarts', 'gallons'],
  dehydrating: ['lbs', 'oz', 'trays'], fermenting: ['jars', 'gallons', 'quarts'], other: ['lbs', 'jars', 'bags', 'count'],
}

function monthLabel(key: string) {
  const [y, m] = key.split('-')
  return new Date(parseInt(y), parseInt(m) - 1).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
}

type ProjectOption = { id: string; label: string }
type HarvestOption = { id: string; crop_name: string; actual_harvest: string | null }

export default function PreservationClient({ initialLogs, initialInputs, childList, subjects, projects, harvests }: {
  initialLogs: PreservationLog[]
  initialInputs: HomesteadInput[]
  childList: Child[]
  subjects: Subject[]
  projects: ProjectOption[]
  harvests: HarvestOption[]
}) {
  const supabase = createClient()
  const [logs, setLogs] = useState(initialLogs)
  const [inputs, setInputs] = useState(initialInputs)

  // Re-sync when the server hands down fresh props. The cost form writes via a server action
  // + revalidatePath, which re-renders this page — but state seeded once from props ignores
  // that, so a saved cost stayed invisible until a hard reload. It WAS in the DB; the page
  // never re-read it. Adjusting state during render (not in an effect) is React's documented
  // way to reset state on a prop change: no cascading render, no effect.
  const [syncedFrom, setSyncedFrom] = useState(initialLogs)
  if (syncedFrom !== initialLogs) {
    setSyncedFrom(initialLogs)
    setLogs(initialLogs)
    setInputs(initialInputs)
  }

  const [editingId, setEditingId] = useState<string | null>(null)
  const [editingInputId, setEditingInputId] = useState<string | null>(null)

  const subjectMap: Record<string, string> = {}
  subjects.forEach(s => { subjectMap[s.id] = s.name })
  const childMap: Record<string, string> = {}
  childList.forEach(c => { childMap[c.id] = c.name })
  const projectMap: Record<string, string> = {}
  projects.forEach(p => { projectMap[p.id] = p.label })
  const harvestMap: Record<string, string> = {}
  harvests.forEach(h => { harvestMap[h.id] = h.crop_name })

  const methodCounts = logs.reduce((acc, l) => { acc[l.method] = (acc[l.method] ?? 0) + 1; return acc }, {} as Record<string, number>)
  const topMethod = Object.entries(methodCounts).sort((a, b) => b[1] - a[1])[0]?.[0]
  const totalInputCost = inputs.reduce((sum, i) => sum + i.cost, 0)

  const grouped: Record<string, PreservationLog[]> = {}
  logs.forEach(l => {
    const key = l.log_date.slice(0, 7)
    if (!grouped[key]) grouped[key] = []
    grouped[key].push(l)
  })

  async function deleteLog(id: string) {
    await supabase.from('preservation_logs').delete().eq('id', id)
    setLogs(prev => prev.filter(l => l.id !== id))
    if (editingId === id) setEditingId(null)
  }

  async function updateLog(id: string, patch: Partial<PreservationLog>) {
    const { error } = await supabase.from('preservation_logs').update(patch).eq('id', id)
    if (!error) { setLogs(prev => prev.map(l => l.id === id ? { ...l, ...patch } : l)); setEditingId(null) }
  }

  async function deleteInput(id: string) {
    await supabase.from('homestead_inputs').delete().eq('id', id)
    setInputs(prev => prev.filter(i => i.id !== id))
    if (editingInputId === id) setEditingInputId(null)
  }

  async function updateInput(id: string, patch: Partial<HomesteadInput>) {
    const { error } = await supabase.from('homestead_inputs').update(patch).eq('id', id)
    if (!error) { setInputs(prev => prev.map(i => i.id === id ? { ...i, ...patch } : i)); setEditingInputId(null) }
  }

  return (
    <div className="min-h-screen bg-surface text-content">
      <nav className="border-b border-line/60 px-6 py-4 flex items-center gap-3">
        <Link href="/dashboard/household" className="text-subtle hover:text-content text-sm transition-colors">← Household</Link>
        <span className="text-subtle">/</span>
        <h1 className="text-sm font-semibold text-sky-600 dark:text-sky-400">Food Preservation</h1>
      </nav>

      <main className="max-w-2xl mx-auto px-6 py-8 pb-24">
        <div className="flex items-start justify-between mb-6">
          <div>
            <h2 className="text-xl font-bold mb-1 tracking-tight">Food Preservation</h2>
            <p className="text-muted text-sm">Log every batch — canned, frozen, dehydrated, or fermented.</p>
          </div>
        </div>

        {/* Quick-add: the routine batch. Narrative days go through the AI log. */}
        <QuickLog config={preservationQuickLog()} childList={childList} subjects={subjects} />

        {logs.length > 0 && (
          <div className="grid grid-cols-3 gap-3 mb-8">
            <div className="bg-card/60 border border-line/60 rounded-xl px-4 py-3 text-center">
              <div className="text-lg font-bold text-sky-600 dark:text-sky-400">{logs.length}</div>
              <div className="text-xs text-subtle mt-0.5">batches logged</div>
            </div>
            <div className="bg-card/60 border border-line/60 rounded-xl px-4 py-3 text-center">
              <div className="text-lg font-bold text-sky-600 dark:text-sky-400">{Object.keys(grouped).length}</div>
              <div className="text-xs text-subtle mt-0.5">months active</div>
            </div>
            <div className="bg-card/60 border border-line/60 rounded-xl px-4 py-3 text-center">
              <div className="text-lg font-bold text-sky-600 dark:text-sky-400">{topMethod ? METHOD_LABELS[topMethod] ?? topMethod : '—'}</div>
              <div className="text-xs text-subtle mt-0.5">top method</div>
            </div>
          </div>
        )}

        {/* History */}
        {logs.length > 0 ? (
          <div className="space-y-6 mb-10">
            {Object.entries(grouped).map(([monthKey, entries]) => (
              <div key={monthKey}>
                <h3 className="text-xs font-semibold text-subtle uppercase tracking-widest mb-3">{monthLabel(monthKey)} · {entries.length}</h3>
                <div className="space-y-2">
                  {entries.map(entry => (
                    editingId === entry.id
                      ? <PreservationEditCard key={entry.id} entry={entry} subjects={subjects} subjectMap={subjectMap} childMap={childMap}
                          projects={projects} harvests={harvests}
                          onSave={(patch) => updateLog(entry.id, patch)}
                          onDelete={() => deleteLog(entry.id)}
                          onCancel={() => setEditingId(null)} />
                      : (
                        <div key={entry.id} className="bg-card/60 border border-line rounded-xl p-4" style={{ borderLeftColor: 'rgb(14 116 144 / 0.5)', borderLeftWidth: '2px' }}>
                          <div className="flex items-start justify-between">
                            <div>
                              <span className="font-medium text-sm">{entry.item_name}</span>
                              {entry.quantity && <span className="text-sky-600 dark:text-sky-400 font-bold ml-2 text-sm">{entry.quantity} {entry.unit}</span>}
                            </div>
                            <div className="flex items-center gap-2 shrink-0 ml-3">
                              <span className={`text-xs px-2 py-0.5 rounded-full ${METHOD_COLORS[entry.method] ?? 'text-muted bg-elevated'}`}>{METHOD_LABELS[entry.method] ?? entry.method}</span>
                              <span className="text-xs text-subtle">{formatDateWeekday(entry.log_date)}</span>
                              <button onClick={() => setEditingId(entry.id)} className="text-xs text-subtle hover:text-content px-2 py-0.5 rounded border border-line-strong hover:border-line-strong transition-colors">Edit</button>
                            </div>
                          </div>
                          {entry.notes && <p className="text-xs text-muted mt-1.5">{entry.notes}</p>}
                          {(entry.project_id || entry.garden_entry_id) && (
                            <div className="mt-1.5 flex flex-wrap gap-1.5 items-center">
                              {entry.project_id && projectMap[entry.project_id] && (
                                <span className="text-xs bg-elevated text-muted px-2 py-0.5 rounded-full">🏗 {projectMap[entry.project_id]}</span>
                              )}
                              {entry.garden_entry_id && harvestMap[entry.garden_entry_id] && (
                                <span className="text-xs bg-elevated text-muted px-2 py-0.5 rounded-full">🌱 from {harvestMap[entry.garden_entry_id]}</span>
                              )}
                            </div>
                          )}
                          {entry.school_credit && entry.child_ids.length > 0 && (
                            <div className="mt-2 flex flex-wrap gap-1.5 items-center">
                              {entry.subject_ids.map(id => <span key={id} className="text-xs bg-elevated text-muted px-2 py-0.5 rounded-full">{subjectMap[id] ?? id}</span>)}
                              <span className="text-xs text-green-600 dark:text-green-400">→ {entry.child_ids.map(id => childMap[id]).filter(Boolean).join(', ')}</span>
                              {entry.credit_hours && <span className="text-xs text-subtle">{entry.credit_hours}h credit</span>}
                            </div>
                          )}
                        </div>
                      )
                  ))}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-center py-14 mb-8">
            <div className="w-12 h-12 rounded-2xl bg-sky-100 dark:bg-sky-900/30 flex items-center justify-center text-2xl mx-auto mb-3">🫙</div>
            <div className="text-content font-semibold mb-1">No batches logged yet</div>
            <p className="text-subtle text-sm">Start tracking your preservation work below.</p>
          </div>
        )}

        {/* Inputs & Costs */}
        <div className="mb-10">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-xs font-semibold text-subtle uppercase tracking-widest">Inputs & Costs</h3>
            {totalInputCost > 0 && <span className="text-sm font-bold text-red-600 dark:text-red-400">${totalInputCost.toFixed(2)} total</span>}
          </div>
          {inputs.length > 0 && (
            <div className="space-y-2 mb-4">
              {inputs.slice(0, 15).map(input => (
                editingInputId === input.id
                  ? <InputEditCard key={input.id} input={input}
                      onSave={(patch) => updateInput(input.id, patch)}
                      onDelete={() => deleteInput(input.id)}
                      onCancel={() => setEditingInputId(null)} />
                  : (
                    <div key={input.id} className="bg-card/60 border border-line rounded-xl p-3 flex items-center justify-between" style={{ borderLeftColor: 'rgb(14 165 233 / 0.5)', borderLeftWidth: '2px' }}>
                      <div>
                        <span className="text-sm font-medium">{input.item}</span>
                        <span className="text-xs text-subtle ml-2">{input.category}</span>
                        {input.notes && <p className="text-xs text-muted mt-0.5">{input.notes}</p>}
                      </div>
                      <div className="flex items-center gap-3 ml-3 shrink-0">
                        <div className="text-right">
                          <span className="text-sm font-bold text-red-600 dark:text-red-400">${input.cost.toFixed(2)}</span>
                          <span className="block text-xs text-subtle">{formatDateWeekday(input.input_date)}</span>
                        </div>
                        <button onClick={() => setEditingInputId(input.id)} className="text-xs text-subtle hover:text-content px-2 py-0.5 rounded border border-line-strong hover:border-line-strong transition-colors">Edit</button>
                      </div>
                    </div>
                  )
              ))}
            </div>
          )}
          <HomesteadInputForm section="preservation" suggestedCategories={[...new Set(logs.map(l => l.item_name).filter(Boolean))]} projects={projects} />
        </div>

      </main>
    </div>
  )
}

// ── PRESERVATION EDIT CARD ───────────────────────────────────────────────────
function PreservationEditCard({ entry, subjects, subjectMap, childMap, projects, harvests, onSave, onDelete, onCancel }: {
  entry: PreservationLog; subjects: Subject[]; subjectMap: Record<string, string>; childMap: Record<string, string>
  projects: ProjectOption[]; harvests: HarvestOption[]
  onSave: (patch: Partial<PreservationLog>) => void; onDelete: () => void; onCancel: () => void
}) {
  const [itemName, setItemName] = useState(entry.item_name ?? '')
  const [method, setMethod] = useState(entry.method ?? 'canning')
  const [quantity, setQuantity] = useState(entry.quantity?.toString() ?? '')
  const [unit, setUnit] = useState(entry.unit ?? '')
  const [notes, setNotes] = useState(entry.notes ?? '')
  const [logDate, setLogDate] = useState(entry.log_date)
  const [projectId, setProjectId] = useState(entry.project_id ?? '')
  const [gardenEntryId, setGardenEntryId] = useState(entry.garden_entry_id ?? '')
  const [saving, setSaving] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)

  async function handleSave() {
    setSaving(true)
    await onSave({
      item_name: itemName.trim(), method, quantity: quantity ? parseFloat(quantity) : null,
      unit: unit.trim() || null, notes: notes.trim() || null, log_date: logDate,
      project_id: projectId || null, garden_entry_id: gardenEntryId || null,
    })
    setSaving(false)
  }

  return (
    <div className="bg-card/80 border border-sky-200 dark:border-sky-800/60 rounded-xl p-4 space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold text-sky-600 dark:text-sky-400 uppercase tracking-wider">Editing batch</span>
        <button onClick={onCancel} className="text-xs text-subtle hover:text-content">← Cancel</button>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="col-span-2">
          <label className="block text-xs text-subtle mb-1" htmlFor="what-did-you-preserve-1">What did you preserve?</label>
          <input id="what-did-you-preserve-1" type="text" value={itemName} onChange={e => setItemName(e.target.value)} placeholder="e.g. Green beans, Strawberry jam"
            className="w-full bg-elevated border border-line-strong rounded-lg px-3 py-2 text-content text-sm focus:outline-none focus:border-sky-600" />
        </div>
        <div>
          <label className="block text-xs text-subtle mb-1" htmlFor="date-2">Date</label>
          <input id="date-2" type="date" value={logDate} onChange={e => setLogDate(e.target.value)}
            className="appearance-none w-full bg-elevated border border-line-strong rounded-lg px-3 py-2 text-content text-sm focus:outline-none focus:border-sky-600" />
        </div>
        <div>
          <label className="block text-xs text-subtle mb-1" htmlFor="method-3">Method</label>
          <select id="method-3" value={method} onChange={e => setMethod(e.target.value as PreservationMethod)}
            className="w-full bg-elevated border border-line-strong rounded-lg px-3 py-2 text-content text-sm focus:outline-none focus:border-sky-600">
            {METHOD_OPTIONS.map(m => <option key={m} value={m}>{METHOD_LABELS[m]}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-xs text-subtle mb-1" htmlFor="quantity-4">Quantity</label>
          <input id="quantity-4" type="number" value={quantity} onChange={e => setQuantity(e.target.value)} placeholder="0" min="0"
            className="w-full bg-elevated border border-line-strong rounded-lg px-3 py-2 text-content text-sm focus:outline-none focus:border-sky-600" />
        </div>
        <div>
          <label className="block text-xs text-subtle mb-1" htmlFor="unit-5">Unit</label>
          <select id="unit-5" value={unit} onChange={e => setUnit(e.target.value)}
            className="w-full bg-elevated border border-line-strong rounded-lg px-3 py-2 text-content text-sm focus:outline-none focus:border-sky-600">
            {(METHOD_UNITS[method] ?? ['jars','lbs','count']).map(u => <option key={u} value={u}>{u}</option>)}
          </select>
        </div>
      </div>
      <div>
        <label className="block text-xs text-subtle mb-1" htmlFor="notes-6">Notes</label>
        <textarea id="notes-6" value={notes} onChange={e => setNotes(e.target.value)} rows={2} placeholder="Recipe, source, observations..."
          className="w-full bg-elevated border border-line-strong rounded-lg px-3 py-1.5 text-content text-sm resize-none focus:outline-none focus:border-sky-600" />
      </div>
      {(projects.length > 0 || harvests.length > 0) && (
        <div className="grid grid-cols-2 gap-3">
          {projects.length > 0 && (
            <div>
              <label className="block text-xs text-subtle mb-1" htmlFor="pres-project-7">Project <span className="text-subtle">(optional)</span></label>
              <select id="pres-project-7" value={projectId} onChange={e => setProjectId(e.target.value)}
                className="w-full bg-elevated border border-line-strong rounded-lg px-3 py-2 text-content text-sm focus:outline-none focus:border-sky-600">
                <option value="">Not tied to a project</option>
                {projects.map(p => <option key={p.id} value={p.id}>{p.label}</option>)}
              </select>
            </div>
          )}
          {harvests.length > 0 && (
            <div>
              <label className="block text-xs text-subtle mb-1" htmlFor="pres-harvest-8">From harvest <span className="text-subtle">(optional)</span></label>
              <select id="pres-harvest-8" value={gardenEntryId} onChange={e => setGardenEntryId(e.target.value)}
                className="w-full bg-elevated border border-line-strong rounded-lg px-3 py-2 text-content text-sm focus:outline-none focus:border-sky-600">
                <option value="">Not from a tracked harvest</option>
                {harvests.map(h => <option key={h.id} value={h.id}>{h.crop_name}{h.actual_harvest ? ` · ${formatDateWeekday(h.actual_harvest)}` : ''}</option>)}
              </select>
            </div>
          )}
        </div>
      )}
      <div className="flex items-center justify-between pt-1 border-t border-line">
        {confirmDelete ? (
          <div className="flex items-center gap-3">
            <span className="text-xs text-subtle">Delete this batch?</span>
            <button onClick={onDelete} className="text-xs text-red-600 dark:text-red-400 hover:text-red-700 dark:hover:text-red-300 font-medium">Yes, delete</button>
            <button onClick={() => setConfirmDelete(false)} className="text-xs text-subtle">Cancel</button>
          </div>
        ) : (
          <button onClick={() => setConfirmDelete(true)} className="text-xs text-subtle hover:text-red-600 dark:hover:text-red-400 transition-colors">Delete</button>
        )}
        <div className="flex gap-3">
          <button onClick={onCancel} className="text-xs text-subtle hover:text-content">Cancel</button>
          <button onClick={handleSave} disabled={saving}
            className="bg-sky-700 hover:bg-sky-600 disabled:opacity-50 text-white text-xs font-semibold px-4 py-1.5 rounded-lg transition-colors">
            {saving ? 'Saving...' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  )
}
