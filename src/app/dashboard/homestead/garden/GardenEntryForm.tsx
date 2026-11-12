'use client'

import { useToday } from '@/lib/use-today'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import type { Child, Subject, GardenStatus, Project, GardenBed } from '@/lib/types'

const STATUSES: { value: GardenStatus; label: string }[] = [
  { value: 'planned', label: 'Planned' },
  { value: 'planted', label: 'Planted' },
  { value: 'growing', label: 'Growing' },
  { value: 'harvested', label: 'Harvested' },
  { value: 'failed', label: 'Failed' },
]

export default function GardenEntryForm({
  childList,
  subjects,
  projects,
  beds: initialBeds,
}: {
  childList: Child[]
  subjects: Subject[]
  projects: Pick<Project, 'id' | 'title' | 'status'>[]
  beds: GardenBed[]
}) {
  const router = useRouter()
  const supabase = createClient()

  const [cropName, setCropName] = useState('')
  const [variety, setVariety] = useState('')
  const [zone, setZone] = useState('')
  const [bedId, setBedId] = useState('')
  const [status, setStatus] = useState<GardenStatus>('planned')
  const [datePlanted, setDatePlanted] = useToday()
  const [expectedHarvest, setExpectedHarvest] = useState('')
  const [notes, setNotes] = useState('')
  const [projectId, setProjectId] = useState('')
  const [schoolCredit, setSchoolCredit] = useState(false)
  const [selectedChildIds, setSelectedChildIds] = useState<string[]>([])
  const [selectedSubjectIds, setSelectedSubjectIds] = useState<string[]>([])
  const [creditHours, setCreditHours] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  // Local beds — merges prop with any newly created inline
  const [localBeds, setLocalBeds] = useState<GardenBed[]>(initialBeds)
  const [showAddBed, setShowAddBed] = useState(false)
  const [newBedName, setNewBedName] = useState('')
  const [addingBed, setAddingBed] = useState(false)

  const activeBeds = localBeds.filter(b => b.is_active)
  const selectedBed = localBeds.find(b => b.id === bedId)

  function handleBedSelect(val: string) {
    if (val === '__add__') {
      setShowAddBed(true)
      setBedId('')
    } else {
      setBedId(val)
      setShowAddBed(false)
    }
  }

  async function handleAddBed() {
    if (!newBedName.trim()) return
    setAddingBed(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    const { data, error: err } = await supabase
      .from('garden_beds')
      .insert({ user_id: user.id, name: newBedName.trim() })
      .select()
      .single()

    if (data) {
      setLocalBeds(prev => [...prev, data as GardenBed])
      setBedId(data.id)
      setShowAddBed(false)
      setNewBedName('')
    } else if (err) {
      setError(err.message)
    }
    setAddingBed(false)
  }

  function toggleChild(id: string) {
    setSelectedChildIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id])
  }
  function toggleSubject(id: string) {
    setSelectedSubjectIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id])
  }

  async function handleSave() {
    if (!cropName.trim()) return
    setSaving(true)
    setError('')

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    const { error: err } = await supabase.from('garden_entries').insert({
      user_id: user.id,
      crop_name: cropName.trim(),
      variety: variety.trim() || null,
      zone: zone.trim() || null,
      bed_id: bedId || null,
      status,
      date_planted: datePlanted || null,
      expected_harvest: expectedHarvest || null,
      notes: notes.trim() || null,
      project_id: projectId || null,
      school_credit: schoolCredit,
      child_ids: schoolCredit ? selectedChildIds : [],
      subject_ids: schoolCredit ? selectedSubjectIds : [],
      credit_hours: schoolCredit && creditHours ? parseFloat(creditHours) : null,
    })

    if (err) { setError(err.message); setSaving(false); return }

    setCropName(''); setVariety(''); setNotes(''); setExpectedHarvest('')
    setSaving(false)
    router.refresh()
  }

  return (
    <div className="bg-card border border-line rounded-xl p-5 space-y-4">
      <h3 className="text-sm font-semibold text-content">Add a Crop</h3>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs font-medium text-muted uppercase tracking-wider mb-1.5" htmlFor="crop-1">Crop</label>
          <input id="crop-1" type="text" value={cropName} onChange={e => setCropName(e.target.value)}
            placeholder="e.g. Tomatoes, Green beans"
            className="w-full bg-elevated border border-line-strong h-10 rounded-lg px-3 py-2 text-content text-sm placeholder-subtle focus:outline-none focus:border-green-600" />
        </div>
        <div>
          <label className="block text-xs font-medium text-muted uppercase tracking-wider mb-1.5" htmlFor="variety-optional-2">Variety (optional)</label>
          <input id="variety-optional-2" type="text" value={variety} onChange={e => setVariety(e.target.value)}
            placeholder="e.g. Cherokee Purple"
            className="w-full bg-elevated border border-line-strong h-10 rounded-lg px-3 py-2 text-content text-sm placeholder-subtle focus:outline-none focus:border-green-600" />
        </div>
      </div>

      {/* Bed / Plot selector */}
      <div>
        <label className="block text-xs font-medium text-muted uppercase tracking-wider mb-1.5" htmlFor="bed-plot-1">
          Bed / Plot <span className="text-subtle normal-case font-normal">(optional)</span>
        </label>
        <select id="bed-plot-1" value={showAddBed ? '__add__' : bedId}
          onChange={e => handleBedSelect(e.target.value)}
          className="w-full bg-elevated border border-line-strong h-10 rounded-lg px-3 py-2 text-content text-sm focus:outline-none focus:border-green-600">
          <option value="">No specific bed</option>
          {activeBeds.map(b => (
            <option key={b.id} value={b.id}>{b.name}</option>
          ))}
          <option value="__add__">➕ Add new bed...</option>
        </select>
        {showAddBed && (
          <div className="flex gap-2 mt-2">
            <input type="text" value={newBedName} onChange={e => setNewBedName(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleAddBed()}
              placeholder={`e.g. "Front Raised Bed", "Herb Spiral", "Row 3"`}
              className="flex-1 bg-elevated border border-green-700/60 h-9 rounded-lg px-3 text-content text-sm placeholder-subtle focus:outline-none focus:border-green-500"
              autoFocus />
            <button onClick={handleAddBed} disabled={addingBed || !newBedName.trim()}
              className="bg-green-700 hover:bg-green-600 disabled:opacity-50 text-white text-xs font-semibold px-3 h-9 rounded-lg transition-colors shrink-0">
              {addingBed ? '...' : 'Save'}
            </button>
            <button onClick={() => { setShowAddBed(false); setNewBedName('') }}
              className="text-subtle hover:text-content text-xs px-2 h-9">✕</button>
          </div>
        )}
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs font-medium text-muted uppercase tracking-wider mb-1.5" htmlFor="status-3">Status</label>
          <select id="status-3" value={status} onChange={e => setStatus(e.target.value as GardenStatus)}
            className="w-full bg-elevated border border-line-strong h-10 rounded-lg px-3 py-2 text-content text-sm focus:outline-none focus:border-green-600">
            {STATUSES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-muted uppercase tracking-wider mb-1.5" htmlFor="zone-optional-4">Zone (optional)</label>
          <input id="zone-optional-4" type="text" value={zone} onChange={e => setZone(e.target.value)}
            placeholder="e.g. 6b"
            className="w-full bg-elevated border border-line-strong h-10 rounded-lg px-3 py-2 text-content text-sm placeholder-subtle focus:outline-none focus:border-green-600" />
        </div>
      </div>

      <div>
        <label className="block text-xs font-medium text-muted uppercase tracking-wider mb-1.5" htmlFor="date-planted-5">Date Planted</label>
        <input id="date-planted-5" type="date" value={datePlanted} onChange={e => setDatePlanted(e.target.value)}
          className="appearance-none w-full bg-elevated border border-line-strong h-10 rounded-lg px-3 py-2 text-content text-sm focus:outline-none focus:border-green-600" />
      </div>

      <div>
        <label className="block text-xs font-medium text-muted uppercase tracking-wider mb-1.5" htmlFor="expected-harvest-optional-6">Expected Harvest (optional)</label>
        <input id="expected-harvest-optional-6" type="date" value={expectedHarvest} onChange={e => setExpectedHarvest(e.target.value)}
          className="appearance-none w-full bg-elevated border border-line-strong h-10 rounded-lg px-3 py-2 text-content text-sm focus:outline-none focus:border-green-600" />
      </div>

      <div>
        <label className="block text-xs font-medium text-muted uppercase tracking-wider mb-1.5" htmlFor="notes-optional-7">Notes (optional)</label>
        <input id="notes-optional-7" type="text" value={notes} onChange={e => setNotes(e.target.value)}
          placeholder="Soil prep, companion plants, observations..."
          className="w-full bg-elevated border border-line-strong h-10 rounded-lg px-3 py-2 text-content text-sm placeholder-subtle focus:outline-none focus:border-green-600" />
      </div>

      {projects.length > 0 && (
        <div>
          <label className="block text-xs font-medium text-muted uppercase tracking-wider mb-1.5" htmlFor="tag-to-project-optional-8">Tag to Project (optional)</label>
          <select id="tag-to-project-optional-8" value={projectId} onChange={e => setProjectId(e.target.value)}
            className="w-full bg-elevated border border-line-strong h-10 rounded-lg px-3 py-2 text-content text-sm focus:outline-none focus:border-green-600">
            <option value="">No project</option>
            {projects.map(p => <option key={p.id} value={p.id}>{p.title}</option>)}
          </select>
        </div>
      )}

      {childList.length > 0 && (
        <div className="border-t border-line pt-4 space-y-3">
          <label className="flex items-center gap-3 cursor-pointer">
            <input type="checkbox" checked={schoolCredit} onChange={e => setSchoolCredit(e.target.checked)}
              className="w-4 h-4 accent-green-500" />
            <span className="text-sm font-medium text-green-600 dark:text-green-400">Count as school credit</span>
          </label>
          {schoolCredit && (
            <div className="pl-7 space-y-3">
              <div>
                <div className="text-xs text-muted mb-1.5">Which child?</div>
                <div className="flex flex-wrap gap-2">
                  {childList.map(c => (
                    <button key={c.id} type="button" onClick={() => toggleChild(c.id)}
                      className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${selectedChildIds.includes(c.id) ? 'bg-green-700 text-white' : 'bg-elevated text-content hover:bg-line-strong'}`}>
                      {c.name}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <div className="text-xs text-muted mb-1.5">Subjects covered</div>
                <div className="flex flex-wrap gap-2">
                  {subjects.map(s => (
                    <button key={s.id} type="button" onClick={() => toggleSubject(s.id)}
                      className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${selectedSubjectIds.includes(s.id) ? 'bg-green-700 text-white' : 'bg-elevated text-content hover:bg-line-strong'}`}>
                      {s.name}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <div className="text-xs text-muted mb-1.5">Credit hours</div>
                <input type="number" value={creditHours} onChange={e => setCreditHours(e.target.value)}
                  min="0" step="0.5" placeholder="e.g. 1"
                  className="w-28 bg-elevated border border-line-strong h-10 rounded-lg px-3 py-2 text-content text-sm placeholder-subtle focus:outline-none focus:border-green-600" />
              </div>
            </div>
          )}
        </div>
      )}

      {error && <p className="text-red-600 dark:text-red-400 text-sm">{error}</p>}

      <button onClick={handleSave} disabled={saving || !cropName.trim()}
        className="w-full bg-green-700 hover:bg-green-600 disabled:opacity-50 text-white font-bold py-3 rounded-xl transition-colors">
        {saving ? 'Saving...' : 'Add Crop'}
      </button>
    </div>
  )
}
