'use client'

import { useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { formatDateShort } from '@/lib/dates'
import type { GardenEntry, Child, Subject, Project, HomesteadInput, GardenBed } from '@/lib/types'
import GardenEntryForm from './GardenEntryForm'
import HomesteadInputForm from '../HomesteadInputForm'
import { InputEditCard } from '../livestock/LivestockCards'
import QuickLog from '../QuickLog'
import { gardenQuickLog, openPlantings } from './quickLog'

const STATUS_LABELS: Record<string, string> = {
  planned: 'Planned', planted: 'Planted', growing: 'Growing', harvested: 'Harvested', failed: 'Failed',
}
const STATUS_COLORS: Record<string, string> = {
  planned: 'text-muted bg-elevated', planted: 'bg-sky-100 text-sky-800 dark:bg-sky-900/40 dark:text-sky-300',
  growing: 'bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300', harvested: 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300', failed: 'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300',
}
const STATUS_OPTIONS = ['planned', 'planted', 'growing', 'harvested', 'failed']

function formatDate(dateStr: string | null) {
  return dateStr ? formatDateShort(dateStr) : null
}

export default function GardenClient({ initialEntries, initialInputs, initialBeds, childList, subjects, projects }: {
  initialEntries: GardenEntry[]
  initialInputs: HomesteadInput[]
  initialBeds: GardenBed[]
  childList: Child[]
  subjects: Subject[]
  projects: Pick<Project, 'id' | 'title' | 'status'>[]
}) {
  const supabase = createClient()
  const [entries, setEntries] = useState(initialEntries)
  const [inputs, setInputs] = useState(initialInputs)
  const [beds, setBeds] = useState(initialBeds)

  // Re-sync when the server hands down fresh props. The cost form writes via a server action
  // + revalidatePath, which re-renders this page — but state seeded once from props ignores
  // that, so a saved cost stayed invisible until a hard reload. It WAS in the DB; the page
  // never re-read it. Adjusting state during render (not in an effect) is React's documented
  // way to reset state on a prop change: no cascading render, no effect.
  const [syncedFrom, setSyncedFrom] = useState(initialEntries)
  if (syncedFrom !== initialEntries) {
    setSyncedFrom(initialEntries)
    setEntries(initialEntries)
    setInputs(initialInputs)
    setBeds(initialBeds)
  }

  const [editingId, setEditingId] = useState<string | null>(null)
  const [editingInputId, setEditingInputId] = useState<string | null>(null)
  const [showManageBeds, setShowManageBeds] = useState(false)
  const [newBedName, setNewBedName] = useState('')
  const [addingBed, setAddingBed] = useState(false)
  const [bedError, setBedError] = useState('')

  const subjectMap: Record<string, string> = {}
  subjects.forEach(s => { subjectMap[s.id] = s.name })
  const childMap: Record<string, string> = {}
  childList.forEach(c => { childMap[c.id] = c.name })
  const projectMap: Record<string, string> = {}
  projects.forEach(p => { projectMap[p.id] = p.title })
  const bedMap: Record<string, string> = {}
  beds.forEach(b => { bedMap[b.id] = b.name })

  const active = entries.filter(e => e.status !== 'harvested' && e.status !== 'failed')
  const done = entries.filter(e => e.status === 'harvested' || e.status === 'failed')
  // Narrower than `active`: a 'planned' crop isn't in the ground, and the RPC's bind predicate
  // only accepts planted/growing. Offering one here would fail loud at save time.
  const openCrops = openPlantings(entries)
  const totalInputCost = inputs.reduce((sum, i) => sum + i.cost, 0)

  async function deleteEntry(id: string) {
    await supabase.from('garden_entries').delete().eq('id', id)
    setEntries(prev => prev.filter(e => e.id !== id))
    if (editingId === id) setEditingId(null)
  }

  async function updateEntry(id: string, patch: Partial<GardenEntry>) {
    const { error } = await supabase.from('garden_entries').update(patch).eq('id', id)
    if (!error) { setEntries(prev => prev.map(e => e.id === id ? { ...e, ...patch } : e)); setEditingId(null) }
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

  async function handleAddBed() {
    if (!newBedName.trim()) return
    setAddingBed(true); setBedError('')
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    const { data, error: err } = await supabase
      .from('garden_beds').insert({ user_id: user.id, name: newBedName.trim() }).select().single()
    if (data) {
      setBeds(prev => [...prev, data as GardenBed].sort((a, b) => a.name.localeCompare(b.name)))
      setNewBedName('')
    } else if (err) {
      setBedError(err.message.includes('unique') ? 'A bed with that name already exists.' : err.message)
    }
    setAddingBed(false)
  }

  async function toggleBedActive(bed: GardenBed) {
    const { error } = await supabase.from('garden_beds').update({ is_active: !bed.is_active }).eq('id', bed.id)
    if (!error) setBeds(prev => prev.map(b => b.id === bed.id ? { ...b, is_active: !b.is_active } : b))
  }

  function renderEntry(entry: GardenEntry) {
    if (editingId === entry.id) {
      return (
        <GardenEditCard key={entry.id} entry={entry}
          onSave={(patch) => updateEntry(entry.id, patch)}
          onDelete={() => deleteEntry(entry.id)}
          onCancel={() => setEditingId(null)} />
      )
    }
    const planted = formatDate(entry.date_planted)
    const harvest = formatDate(entry.expected_harvest)
    const actual = formatDate(entry.actual_harvest)

    return (
      <div key={entry.id} className="bg-card/60 border border-line rounded-xl p-4" style={{ borderLeftColor: 'rgb(21 128 61 / 0.5)', borderLeftWidth: '2px' }}>
        <div className="flex items-start justify-between">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-medium text-sm">{entry.crop_name}</span>
              {entry.variety && <span className="text-subtle text-xs">({entry.variety})</span>}
              {entry.bed_id && bedMap[entry.bed_id] && (
                <span className="text-xs bg-green-50 dark:bg-green-950/60 text-green-700 dark:text-green-400 px-2 py-0.5 rounded-full border border-green-200 dark:border-green-800/40">
                  {bedMap[entry.bed_id]}
                </span>
              )}
              {entry.project_id && projectMap[entry.project_id] && (
                <span className="text-xs bg-amber-50 dark:bg-amber-950/60 text-amber-700 dark:text-amber-400 px-2 py-0.5 rounded-full border border-amber-200 dark:border-amber-800/40">
                  {projectMap[entry.project_id]}
                </span>
              )}
            </div>
            <div className="flex flex-wrap gap-3 mt-1.5 text-xs text-subtle">
              {planted && <span>Planted {planted}</span>}
              {harvest && !actual && <span>Expected {harvest}</span>}
              {actual && <span>Harvested {actual}</span>}
              {/* The yield, and what it earned. Recorded since P2a but never shown here —
                  a harvest looked identical whether it brought in 2 lbs or 200. */}
              {entry.quantity != null && (
                <span className="font-medium text-amber-700 dark:text-amber-400">
                  {entry.quantity} {entry.unit ?? ''}
                </span>
              )}
              {entry.sale_amount != null && (entry.disposition === 'sold' || entry.disposition === 'mixed') && (
                <span className="font-medium text-green-700 dark:text-green-400">
                  ${entry.sale_amount.toFixed(2)} sold
                </span>
              )}
            </div>
            {entry.notes && <p className="text-xs text-muted mt-1.5">{entry.notes}</p>}
            {entry.school_credit && entry.child_ids.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-1.5 items-center">
                {entry.subject_ids.map(id => (
                  <span key={id} className="text-xs bg-elevated text-muted px-2 py-0.5 rounded-full">{subjectMap[id] ?? id}</span>
                ))}
                <span className="text-xs text-green-600 dark:text-green-400">→ {entry.child_ids.map(id => childMap[id]).filter(Boolean).join(', ')}</span>
                {entry.credit_hours && <span className="text-xs text-subtle">{entry.credit_hours}h credit</span>}
              </div>
            )}
          </div>
          <div className="flex items-center gap-2 ml-3 shrink-0">
            <span className={`text-xs px-2 py-0.5 rounded-full ${STATUS_COLORS[entry.status] ?? 'text-muted bg-elevated'}`}>
              {STATUS_LABELS[entry.status] ?? entry.status}
            </span>
            <button onClick={() => setEditingId(entry.id)} className="text-xs text-subtle hover:text-content px-2 py-0.5 rounded border border-line-strong hover:border-line-strong transition-colors">Edit</button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-surface text-content">
      <nav className="border-b border-line/60 px-6 py-4 flex items-center gap-3">
        <Link href="/dashboard/household" className="text-subtle hover:text-content text-sm transition-colors">← Household</Link>
        <span className="text-subtle">/</span>
        <h1 className="text-sm font-semibold text-green-600 dark:text-green-400">Garden</h1>
      </nav>

      <main className="max-w-2xl mx-auto px-6 py-8 pb-24">
        <div className="flex items-start justify-between mb-6">
          <div>
            <h2 className="text-xl font-bold mb-1 tracking-tight">Garden</h2>
            <p className="text-muted text-sm">Track what you&apos;re growing — from seed to harvest.</p>
          </div>
          <a href="#add-entry" className="shrink-0 ml-4 bg-green-700 hover:bg-green-600 text-white text-sm font-semibold px-4 py-2 rounded-lg transition-colors">+ Add Crop</a>
        </div>

        {/* Quick-add: the routine harvest. Narrative days go through the AI log.
            A harvest closes a specific open planting, so with nothing in the ground there is
            nothing to harvest — point at "Add Crop" rather than render a dead dropdown. */}
        {openCrops.length > 0 ? (
          <QuickLog config={gardenQuickLog(openCrops)} childList={childList} subjects={subjects} />
        ) : (
          <div className="bg-card/60 border border-line rounded-xl p-4 mb-6">
            <p className="text-sm text-muted">
              <span className="font-medium text-content">Nothing in the ground yet.</span>{' '}
              <a href="#add-entry" className="text-green-700 dark:text-green-400 hover:underline font-medium">Add a crop</a>{' '}
              and you can log its harvest here in two taps.
            </p>
          </div>
        )}

        {/* Manage Garden Beds panel */}
        <div className="mb-6 border border-line rounded-xl overflow-hidden">
          <button
            onClick={() => setShowManageBeds(p => !p)}
            className="w-full flex items-center justify-between px-4 py-3 bg-card/60 hover:bg-card transition-colors text-left"
          >
            <div className="flex items-center gap-2">
              <span className="text-sm font-semibold text-content">🌱 Manage Garden Beds</span>
              {beds.length > 0 && (
                <span className="text-xs bg-elevated text-muted px-2 py-0.5 rounded-full">
                  {beds.filter(b => b.is_active).length} active
                </span>
              )}
            </div>
            <span className="text-subtle text-xs">{showManageBeds ? '▲' : '▼'}</span>
          </button>

          {showManageBeds && (
            <div className="px-4 pb-4 pt-3 bg-card/30 space-y-3">
              {beds.length > 0 ? (
                <div className="space-y-1.5">
                  {beds.map(bed => (
                    <div key={bed.id} className="flex items-center justify-between py-1.5 px-3 bg-card/60 border border-line rounded-lg">
                      <span className={`text-sm font-medium ${bed.is_active ? 'text-content' : 'text-subtle line-through'}`}>
                        {bed.name}
                      </span>
                      <button
                        onClick={() => toggleBedActive(bed)}
                        className={`text-xs px-2.5 py-1 rounded-full border transition-colors ${
                          bed.is_active
                            ? 'border-line-strong text-muted hover:border-red-700 hover:text-red-600 dark:hover:text-red-400'
                            : 'border-green-200 dark:border-green-900 text-green-600 hover:text-green-600 dark:hover:text-green-400'
                        }`}
                      >
                        {bed.is_active ? 'Archive' : 'Reactivate'}
                      </button>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-subtle py-1">No beds defined yet. Add one below.</p>
              )}
              <div className="border-t border-line pt-3">
                <p className="text-xs font-semibold text-subtle uppercase tracking-wider mb-2">Add bed / plot</p>
                <div className="flex gap-2">
                  <input type="text" value={newBedName} onChange={e => setNewBedName(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && handleAddBed()}
                    placeholder={`e.g. "Front Raised Bed", "Herb Spiral", "Row 3"`}
                    className="flex-1 bg-elevated border border-line-strong h-9 rounded-lg px-3 text-content text-sm placeholder-subtle focus:outline-none focus:border-green-600" />
                  <button onClick={handleAddBed} disabled={addingBed || !newBedName.trim()}
                    className="bg-green-700 hover:bg-green-600 disabled:opacity-50 text-white text-xs font-semibold px-3 h-9 rounded-lg transition-colors shrink-0">
                    {addingBed ? '...' : 'Add'}
                  </button>
                </div>
                {bedError && <p className="text-red-600 dark:text-red-400 text-xs mt-1">{bedError}</p>}
              </div>
            </div>
          )}
        </div>

        {entries.length > 0 && (
          <div className="grid grid-cols-3 gap-3 mb-8">
            <div className="bg-card/60 border border-line/60 rounded-xl px-4 py-3 text-center">
              <div className="text-lg font-bold text-green-600 dark:text-green-400">{active.length}</div>
              <div className="text-xs text-subtle mt-0.5">growing</div>
            </div>
            <div className="bg-card/60 border border-line/60 rounded-xl px-4 py-3 text-center">
              <div className="text-lg font-bold text-amber-600 dark:text-amber-400">{done.filter(e => e.status === 'harvested').length}</div>
              <div className="text-xs text-subtle mt-0.5">harvested</div>
            </div>
            <div className="bg-card/60 border border-line/60 rounded-xl px-4 py-3 text-center">
              <div className="text-lg font-bold text-content">{entries.length}</div>
              <div className="text-xs text-subtle mt-0.5">total crops</div>
            </div>
          </div>
        )}

        {active.length > 0 && (
          <div className="mb-8">
            <h3 className="text-xs font-semibold text-subtle uppercase tracking-widest mb-3">In the Ground · {active.length}</h3>
            <div className="space-y-2">{active.map(e => renderEntry(e))}</div>
          </div>
        )}

        {done.length > 0 && (
          <div className="mb-8">
            <h3 className="text-xs font-semibold text-subtle uppercase tracking-widest mb-3">Past Crops · {done.length}</h3>
            <div className="space-y-2">{done.map(e => renderEntry(e))}</div>
          </div>
        )}

        {entries.length === 0 && (
          <div className="text-center py-14 mb-8">
            <div className="w-12 h-12 rounded-2xl bg-green-100 dark:bg-green-900/30 flex items-center justify-center text-2xl mx-auto mb-3">🌱</div>
            <div className="text-content font-semibold mb-1">Nothing planted yet</div>
            <p className="text-subtle text-sm">Add your first crop below to start tracking your garden.</p>
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
                    <div key={input.id} className="bg-card/60 border border-line rounded-xl p-3 flex items-center justify-between" style={{ borderLeftColor: 'rgb(34 197 94 / 0.5)', borderLeftWidth: '2px' }}>
                      <div>
                        <span className="text-sm font-medium">{input.item}</span>
                        <span className="text-xs text-subtle ml-2">{input.category}</span>
                        {input.notes && <p className="text-xs text-muted mt-0.5">{input.notes}</p>}
                      </div>
                      <div className="flex items-center gap-3 ml-3 shrink-0">
                        <div className="text-right">
                          <span className="text-sm font-bold text-red-600 dark:text-red-400">${input.cost.toFixed(2)}</span>
                          <span className="block text-xs text-subtle">{formatDate(input.input_date)}</span>
                        </div>
                        <button onClick={() => setEditingInputId(input.id)} className="text-xs text-subtle hover:text-content px-2 py-0.5 rounded border border-line-strong hover:border-line-strong transition-colors">Edit</button>
                      </div>
                    </div>
                  )
              ))}
            </div>
          )}
          <HomesteadInputForm section="garden" suggestedCategories={[...new Set(entries.map(e => e.crop_name).filter(Boolean))]} />
        </div>

        <div id="add-entry" className="scroll-mt-8">
          <h3 className="text-xs font-semibold text-subtle uppercase tracking-widest mb-4">Add Crop</h3>
          <GardenEntryForm childList={childList} subjects={subjects} projects={projects} beds={beds} />
        </div>
      </main>
    </div>
  )
}

// ── GARDEN EDIT CARD ─────────────────────────────────────────────────────────
function GardenEditCard({ entry, onSave, onDelete, onCancel }: {
  entry: GardenEntry
  onSave: (patch: Partial<GardenEntry>) => void
  onDelete: () => void
  onCancel: () => void
}) {
  const [cropName, setCropName] = useState(entry.crop_name)
  const [variety, setVariety] = useState(entry.variety ?? '')
  const [status, setStatus] = useState(entry.status)
  const [datePlanted, setDatePlanted] = useState(entry.date_planted ?? '')
  const [expectedHarvest, setExpectedHarvest] = useState(entry.expected_harvest ?? '')
  const [actualHarvest, setActualHarvest] = useState(entry.actual_harvest ?? '')
  const [notes, setNotes] = useState(entry.notes ?? '')
  const [saving, setSaving] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)

  async function handleSave() {
    setSaving(true)
    await onSave({
      crop_name: cropName.trim(), variety: variety.trim() || null,
      status: status as GardenEntry['status'],
      date_planted: datePlanted || null, expected_harvest: expectedHarvest || null,
      actual_harvest: actualHarvest || null, notes: notes.trim() || null,
    })
    setSaving(false)
  }

  return (
    <div className="bg-card/80 border border-green-200 dark:border-green-800/60 rounded-xl p-4 space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold text-green-600 dark:text-green-400 uppercase tracking-wider">Editing crop</span>
        <button onClick={onCancel} className="text-xs text-subtle hover:text-content">← Cancel</button>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs text-subtle mb-1" htmlFor="crop-name-1">Crop name</label>
          <input id="crop-name-1" type="text" value={cropName} onChange={e => setCropName(e.target.value)}
            className="w-full bg-elevated border border-line-strong rounded-lg px-3 py-1.5 text-content text-sm focus:outline-none focus:border-green-600" />
        </div>
        <div>
          <label className="block text-xs text-subtle mb-1" htmlFor="variety-optional-2">Variety (optional)</label>
          <input id="variety-optional-2" type="text" value={variety} onChange={e => setVariety(e.target.value)} placeholder="e.g. Roma"
            className="w-full bg-elevated border border-line-strong rounded-lg px-3 py-1.5 text-content text-sm focus:outline-none focus:border-green-600" />
        </div>
        <div>
          <label className="block text-xs text-subtle mb-1" htmlFor="status-3">Status</label>
          <select id="status-3" value={status} onChange={e => setStatus(e.target.value as GardenEntry['status'])}
            className="w-full bg-elevated border border-line-strong rounded-lg px-3 py-1.5 text-content text-sm focus:outline-none focus:border-green-600">
            {STATUS_OPTIONS.map(s => <option key={s} value={s}>{STATUS_LABELS[s]}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-xs text-subtle mb-1" htmlFor="date-planted-4">Date planted</label>
          <input id="date-planted-4" type="date" value={datePlanted} onChange={e => setDatePlanted(e.target.value)}
            className="appearance-none w-full bg-elevated border border-line-strong rounded-lg px-3 py-1.5 text-content text-sm focus:outline-none focus:border-green-600" />
        </div>
        <div>
          <label className="block text-xs text-subtle mb-1" htmlFor="expected-harvest-5">Expected harvest</label>
          <input id="expected-harvest-5" type="date" value={expectedHarvest} onChange={e => setExpectedHarvest(e.target.value)}
            className="appearance-none w-full bg-elevated border border-line-strong rounded-lg px-3 py-1.5 text-content text-sm focus:outline-none focus:border-green-600" />
        </div>
        <div>
          <label className="block text-xs text-subtle mb-1" htmlFor="actual-harvest-date-6">Actual harvest date</label>
          <input id="actual-harvest-date-6" type="date" value={actualHarvest} onChange={e => setActualHarvest(e.target.value)}
            className="appearance-none w-full bg-elevated border border-line-strong rounded-lg px-3 py-1.5 text-content text-sm focus:outline-none focus:border-green-600" />
        </div>
      </div>
      <div>
        <label className="block text-xs text-subtle mb-1" htmlFor="notes-7">Notes</label>
        <textarea id="notes-7" value={notes} onChange={e => setNotes(e.target.value)} rows={2} placeholder="Notes..."
          className="w-full bg-elevated border border-line-strong rounded-lg px-3 py-1.5 text-content text-sm resize-none focus:outline-none focus:border-green-600" />
      </div>
      <div className="flex items-center justify-between pt-1 border-t border-line">
        {confirmDelete ? (
          <div className="flex items-center gap-3">
            <span className="text-xs text-subtle">Delete this crop?</span>
            <button onClick={onDelete} className="text-xs text-red-600 dark:text-red-400 hover:text-red-700 dark:hover:text-red-300 font-medium">Yes, delete</button>
            <button onClick={() => setConfirmDelete(false)} className="text-xs text-subtle">Cancel</button>
          </div>
        ) : (
          <button onClick={() => setConfirmDelete(true)} className="text-xs text-subtle hover:text-red-600 dark:hover:text-red-400 transition-colors">Delete</button>
        )}
        <div className="flex gap-3">
          <button onClick={onCancel} className="text-xs text-subtle hover:text-content">Cancel</button>
          <button onClick={handleSave} disabled={saving}
            className="bg-green-700 hover:bg-green-600 disabled:opacity-50 text-white text-xs font-semibold px-4 py-1.5 rounded-lg transition-colors">
            {saving ? 'Saving...' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  )
}
