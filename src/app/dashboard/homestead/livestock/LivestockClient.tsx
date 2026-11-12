'use client'

import { useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { formatDateWeekday } from '@/lib/dates'
import { normalizeAnimalType } from '@/lib/homestead'
import type { LivestockLog, Child, Subject, Project, HomesteadInput, LivestockAnimal } from '@/lib/types'
import HomesteadInputForm from '../HomesteadInputForm'
import QuickLog from '../QuickLog'
import { livestockQuickLog } from './quickLog'
import { LivestockEntryCard, LivestockEditCard, InputEditCard } from './LivestockCards'

const BUILT_IN_ANIMALS = ['chickens', 'ducks', 'goats', 'cows', 'pigs', 'bees', 'rabbits', 'other']

// One normalized animal list, shared by the QuickLog and the cost form's "for which animal?"
// picker — so a cost and a production log attribute to the SAME key and Intelligence can
// join them. Registry + already-logged types first (what this user actually has), then the
// built-ins as a fallback for a brand-new account.
function animalTypeOptions(animals: LivestockAnimal[], logs: LivestockLog[]) {
  const seen = new Map<string, string>()
  const add = (raw: string | null | undefined) => {
    const { key, label } = normalizeAnimalType(raw)
    if (key && !seen.has(key)) seen.set(key, label)
  }
  animals.filter(a => a.is_active).forEach(a => add(a.animal_type))
  logs.forEach(l => add(l.animal_type))
  BUILT_IN_ANIMALS.forEach(add)
  return [...seen].map(([key, label]) => ({ key, label }))
}


export default function LivestockClient({
  initialLogs, initialInputs, initialAnimals, childList, subjects, projects,
}: {
  initialLogs: LivestockLog[]
  initialInputs: HomesteadInput[]
  initialAnimals: LivestockAnimal[]
  childList: Child[]
  subjects: Subject[]
  projects: Pick<Project, 'id' | 'title' | 'status'>[]
}) {
  const supabase = createClient()
  const [logs, setLogs] = useState(initialLogs)
  const [inputs, setInputs] = useState(initialInputs)
  const [animals, setAnimals] = useState(initialAnimals)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editingInputId, setEditingInputId] = useState<string | null>(null)
  // These lists are seeded from server props but then owned locally (optimistic edit/delete).
  // A write from the QuickLog (router.refresh()) or the cost form (revalidatePath) re-renders
  // the server component and hands down fresh props — without this re-sync the seeded state
  // wins and the row the user just saved is invisible until a hard reload. It IS in the DB;
  // the page just never re-read it.
  //
  // Adjusting state during render (not in an effect) is React's documented way to reset state
  // when a prop changes: React re-runs this component immediately, before committing or
  // painting, so there's no cascading render. Every server render hands down fresh array
  // identities, so initialLogs is a sufficient sentinel for all three.
  const [syncedFrom, setSyncedFrom] = useState(initialLogs)
  if (syncedFrom !== initialLogs) {
    setSyncedFrom(initialLogs)
    setLogs(initialLogs)
    setInputs(initialInputs)
    setAnimals(initialAnimals)
  }

  const [showManageAnimals, setShowManageAnimals] = useState(false)
  const [newAnimalType, setNewAnimalType] = useState('chickens')
  const [newAnimalName, setNewAnimalName] = useState('')
  const [addingAnimal, setAddingAnimal] = useState(false)
  const [animalError, setAnimalError] = useState('')

  const subjectMap: Record<string, string> = {}
  subjects.forEach(s => { subjectMap[s.id] = s.name })
  const childMap: Record<string, string> = {}
  childList.forEach(c => { childMap[c.id] = c.name })
  const projectMap: Record<string, string> = {}
  projects.forEach(p => { projectMap[p.id] = p.title })

  const animalTypes = animalTypeOptions(animals, logs)

  const totalEggs = logs.filter(l => l.unit === 'eggs').reduce((sum, l) => sum + (l.quantity ?? 0), 0)
  const recentDays = new Set(logs.slice(0, 14).map(l => l.log_date)).size
  const totalInputCost = inputs.reduce((sum, i) => sum + i.cost, 0)

  const grouped: Record<string, LivestockLog[]> = {}
  logs.forEach(l => {
    if (!grouped[l.log_date]) grouped[l.log_date] = []
    grouped[l.log_date].push(l)
  })

  async function deleteLog(id: string) {
    await supabase.from('livestock_logs').delete().eq('id', id)
    setLogs(prev => prev.filter(l => l.id !== id))
    if (editingId === id) setEditingId(null)
  }

  async function updateLog(id: string, patch: Partial<LivestockLog>) {
    const { error } = await supabase.from('livestock_logs').update(patch).eq('id', id)
    if (!error) {
      setLogs(prev => prev.map(l => l.id === id ? { ...l, ...patch } : l))
      setEditingId(null)
    }
  }

  async function deleteInput(id: string) {
    await supabase.from('homestead_inputs').delete().eq('id', id)
    setInputs(prev => prev.filter(i => i.id !== id))
    if (editingInputId === id) setEditingInputId(null)
  }

  async function updateInput(id: string, patch: Partial<HomesteadInput>) {
    const { error } = await supabase.from('homestead_inputs').update(patch).eq('id', id)
    if (!error) {
      setInputs(prev => prev.map(i => i.id === id ? { ...i, ...patch } : i))
      setEditingInputId(null)
    }
  }

  async function handleAddAnimal() {
    if (!newAnimalName.trim()) return
    setAddingAnimal(true)
    setAnimalError('')
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    const { data, error: err } = await supabase
      .from('livestock_animals')
      .insert({ user_id: user.id, animal_type: newAnimalType, name: newAnimalName.trim() })
      .select().single()

    if (data) {
      setAnimals(prev => [...prev, data as LivestockAnimal].sort((a, b) => a.name.localeCompare(b.name)))
      setNewAnimalName('')
    } else if (err) {
      setAnimalError(err.message.includes('unique') ? 'An animal with that name already exists.' : err.message)
    }
    setAddingAnimal(false)
  }

  async function toggleAnimalActive(animal: LivestockAnimal) {
    const { error } = await supabase
      .from('livestock_animals')
      .update({ is_active: !animal.is_active })
      .eq('id', animal.id)
    if (!error) {
      setAnimals(prev => prev.map(a => a.id === animal.id ? { ...a, is_active: !a.is_active } : a))
    }
  }

  const ANIMAL_TYPES = ['chickens', 'ducks', 'goats', 'cows', 'pigs', 'bees', 'rabbits', 'other']

  return (
    <div className="min-h-screen bg-surface text-content">
      <nav className="border-b border-line/60 px-6 py-4 flex items-center gap-3">
        <Link href="/dashboard/household" className="text-subtle hover:text-content text-sm transition-colors">← Household</Link>
        <span className="text-subtle">/</span>
        <h1 className="text-sm font-semibold text-amber-600 dark:text-amber-400">Livestock</h1>
      </nav>

      <main className="max-w-2xl mx-auto px-6 py-8 pb-24">
        <div className="flex items-start justify-between mb-6">
          <div>
            <h2 className="text-xl font-bold mb-1 tracking-tight">Livestock</h2>
            <p className="text-muted text-sm">Daily production — eggs, milk, anything you&apos;re counting.</p>
          </div>
        </div>

        {/* Quick-add: the routine daily count. Narrative days go through the AI log.
            Animal + project live under "＋ More details" — they came from LivestockLogForm,
            which wrote straight to the table instead of through save_log_entry. */}
        <QuickLog config={livestockQuickLog(animalTypes, animals, projects)} childList={childList} subjects={subjects} />

        {/* Manage Animals panel */}
        <div className="mb-6 border border-line rounded-xl overflow-hidden">
          <button
            onClick={() => setShowManageAnimals(p => !p)}
            className="w-full flex items-center justify-between px-4 py-3 bg-card/60 hover:bg-card transition-colors text-left"
          >
            <div className="flex items-center gap-2">
              <span className="text-sm font-semibold text-content">🐄 Manage Animals & Flocks</span>
              {animals.length > 0 && (
                <span className="text-xs bg-elevated text-muted px-2 py-0.5 rounded-full">
                  {animals.filter(a => a.is_active).length} active
                </span>
              )}
            </div>
            <span className="text-subtle text-xs">{showManageAnimals ? '▲' : '▼'}</span>
          </button>

          {showManageAnimals && (
            <div className="px-4 pb-4 pt-3 bg-card/30 space-y-3">
              {animals.length > 0 ? (
                <div className="space-y-1.5">
                  {animals.map(animal => (
                    <div key={animal.id} className="flex items-center justify-between py-1.5 px-3 bg-card/60 border border-line rounded-lg">
                      <div>
                        <span className={`text-sm font-medium ${animal.is_active ? 'text-content' : 'text-subtle line-through'}`}>
                          {animal.name}
                        </span>
                        <span className="text-xs text-subtle ml-2 capitalize">{animal.animal_type}</span>
                      </div>
                      <button
                        onClick={() => toggleAnimalActive(animal)}
                        className={`text-xs px-2.5 py-1 rounded-full border transition-colors ${
                          animal.is_active
                            ? 'border-line-strong text-muted hover:border-red-700 hover:text-red-600 dark:hover:text-red-400'
                            : 'border-green-200 dark:border-green-900 text-green-600 hover:text-green-600 dark:hover:text-green-400'
                        }`}
                      >
                        {animal.is_active ? 'Retire' : 'Reactivate'}
                      </button>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-subtle py-1">No animals defined yet. Add one below.</p>
              )}

              <div className="border-t border-line pt-3">
                <p className="text-xs font-semibold text-subtle uppercase tracking-wider mb-2">Add animal / flock</p>
                <div className="flex gap-2">
                  <select value={newAnimalType} onChange={e => setNewAnimalType(e.target.value)}
                    className="bg-elevated border border-line-strong h-9 rounded-lg px-2 text-content text-xs focus:outline-none focus:border-amber-600 shrink-0">
                    {ANIMAL_TYPES.map(t => <option key={t} value={t} className="capitalize">{t.charAt(0).toUpperCase() + t.slice(1)}</option>)}
                  </select>
                  <input type="text" value={newAnimalName} onChange={e => setNewAnimalName(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && handleAddAnimal()}
                    placeholder={`e.g. "Laying Flock 1", "Daisy"`}
                    className="flex-1 bg-elevated border border-line-strong h-9 rounded-lg px-3 text-content text-sm placeholder-subtle focus:outline-none focus:border-amber-600" />
                  <button onClick={handleAddAnimal} disabled={addingAnimal || !newAnimalName.trim()}
                    className="bg-amber-700 hover:bg-amber-600 disabled:opacity-50 text-white text-xs font-semibold px-3 h-9 rounded-lg transition-colors shrink-0">
                    {addingAnimal ? '...' : 'Add'}
                  </button>
                </div>
                {animalError && <p className="text-red-600 dark:text-red-400 text-xs mt-1">{animalError}</p>}
              </div>
            </div>
          )}
        </div>

        {/* Stats */}
        {logs.length > 0 && (
          <div className="grid grid-cols-3 gap-3 mb-8">
            <div className="bg-card/60 border border-line/60 rounded-xl px-4 py-3 text-center">
              <div className="text-lg font-bold text-amber-600 dark:text-amber-400">{logs.length}</div>
              <div className="text-xs text-subtle mt-0.5">total logs</div>
            </div>
            <div className="bg-card/60 border border-line/60 rounded-xl px-4 py-3 text-center">
              <div className="text-lg font-bold text-amber-600 dark:text-amber-400">{recentDays}</div>
              <div className="text-xs text-subtle mt-0.5">days logged</div>
            </div>
            <div className="bg-card/60 border border-line/60 rounded-xl px-4 py-3 text-center">
              <div className="text-lg font-bold text-amber-600 dark:text-amber-400">{totalEggs > 0 ? totalEggs : '—'}</div>
              <div className="text-xs text-subtle mt-0.5">eggs tracked</div>
            </div>
          </div>
        )}

        {/* Log history */}
        {logs.length > 0 ? (
          <div className="space-y-6 mb-10">
            <h3 className="text-xs font-semibold text-subtle uppercase tracking-widest">History</h3>
            {Object.entries(grouped).map(([date, entries]) => (
              <div key={date}>
                <div className="text-xs text-subtle mb-2 font-medium">{formatDateWeekday(date)}</div>
                <div className="space-y-2">
                  {entries.map(entry => (
                    editingId === entry.id
                      ? <LivestockEditCard key={entry.id} entry={entry} subjects={subjects} subjectMap={subjectMap} childMap={childMap}
                          onSave={(patch) => updateLog(entry.id, patch)}
                          onDelete={() => deleteLog(entry.id)}
                          onCancel={() => setEditingId(null)} />
                      : <LivestockEntryCard key={entry.id} entry={entry} subjectMap={subjectMap} childMap={childMap} projectMap={projectMap}
                          onEdit={() => setEditingId(entry.id)} />
                  ))}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-center py-14 mb-8">
            <div className="w-12 h-12 rounded-2xl bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center text-2xl mx-auto mb-3">🐓</div>
            <div className="text-content font-semibold mb-1">No logs yet</div>
            <p className="text-subtle text-sm">Start tracking daily production below.</p>
          </div>
        )}

        {/* Inputs & Costs. Anchored: Intelligence's "costs unattributed" nudge links straight here. */}
        <div id="inputs" className="mb-10 scroll-mt-8">
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
                    <div key={input.id} className="bg-card/60 border border-line rounded-xl p-3 flex items-center justify-between" style={{ borderLeftColor: 'rgb(239 68 68 / 0.5)', borderLeftWidth: '2px' }}>
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
          <HomesteadInputForm
            section="livestock"
            suggestedCategories={[...new Set(logs.map(l => l.animal_type).filter(Boolean))]}
            animalTypes={animalTypes}
          />
        </div>

      </main>
    </div>
  )
}
