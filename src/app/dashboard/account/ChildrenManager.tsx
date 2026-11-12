'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { Child } from '@/lib/types'

const LEARNING_STYLES = [
  { value: 'eclectic', label: 'Eclectic' },
  { value: 'charlotte_mason', label: 'Charlotte Mason' },
  { value: 'structured', label: 'Structured / Classical' },
  { value: 'unschooling', label: 'Unschooling' },
  { value: 'project_based', label: 'Project-Based' },
]

const CHILD_COLORS = [
  { key: 'green', label: 'Green', ring: 'ring-green-500', bg: 'bg-green-500' },
  { key: 'sky', label: 'Sky', ring: 'ring-sky-500', bg: 'bg-sky-500' },
  { key: 'amber', label: 'Amber', ring: 'ring-amber-500', bg: 'bg-amber-500' },
  { key: 'rose', label: 'Rose', ring: 'ring-rose-500', bg: 'bg-rose-500' },
  { key: 'violet', label: 'Violet', ring: 'ring-violet-500', bg: 'bg-violet-500' },
  { key: 'teal', label: 'Teal', ring: 'ring-teal-500', bg: 'bg-teal-500' },
]

const LEARNING_SUPPORT_OPTIONS = [
  'ADHD', 'ADD', 'Dyslexia', 'Autism / ASD', 'Sensory Processing',
  'Anxiety', 'Dyscalculia', 'Dysgraphia', 'Gifted / 2e', 'Processing Differences',
]

export function getChildColor(color: string | null) {
  return CHILD_COLORS.find(c => c.key === color) ?? CHILD_COLORS[0]
}

export default function ChildrenManager({ initialChildren }: { initialChildren: Child[] }) {
  const [children, setChildren] = useState<Child[]>(initialChildren)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editForm, setEditForm] = useState<Partial<Child> & { learning_support: string[] }>({ learning_support: [] })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [showAdd, setShowAdd] = useState(false)
  const [addForm, setAddForm] = useState({
    name: '', grade_level: '', birthdate: '',
    learning_style: 'eclectic', color: 'green',
    learning_support: [] as string[], ai_notes: '',
  })
  const supabase = createClient()

  function startEdit(child: Child) {
    setEditingId(child.id)
    setEditForm({
      name: child.name,
      birthdate: child.birthdate ?? '',
      grade_level: child.grade_level ?? '',
      learning_style: child.learning_style ?? 'eclectic',
      color: child.color ?? 'green',
      learning_support: child.learning_support ?? [],
      ai_notes: child.ai_notes ?? '',
    })
    setError('')
  }

  function toggleSupport(list: string[], val: string): string[] {
    return list.includes(val) ? list.filter(x => x !== val) : [...list, val]
  }

  async function handleAdd() {
    if (!addForm.name.trim()) { setError('Name is required.'); return }
    setSaving(true); setError('')
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setSaving(false); return }

    const { data, error: err } = await supabase.from('children').insert({
      user_id: user.id,
      name: addForm.name.trim(),
      birthdate: addForm.birthdate || null,
      grade_level: addForm.grade_level || null,
      learning_style: addForm.learning_style,
      color: addForm.color,
      learning_support: addForm.learning_support,
      ai_notes: addForm.ai_notes.trim() || null,
    }).select().single()

    if (err) { setError(err.message); setSaving(false); return }

    // Give the new child an ACTIVE school year immediately — otherwise their homeschool logs
    // save with a null school_year_id and reports can't scope them (they show unscoped /
    // look identical to a sibling co-logged on the same day). Inherit the family's CURRENT
    // year (state + window + days/week) from an existing sibling's active year so the new
    // child joins the year the household is actually tracking; fall back to a computed
    // current year if this is somehow the first. Non-fatal: the child is already added, and
    // Setup can still create/adjust the year. (Onboarding creates the first child's year;
    // this covers every child added afterward — the path that was missing it.)
    try {
      const { data: sib } = await supabase
        .from('school_years')
        .select('name, start_date, end_date, days_per_week, state')
        .eq('is_active', true)
        .order('start_date', { ascending: false })
        .limit(1)
        .maybeSingle()
      let year: { name: string; start_date: string; end_date: string; days_per_week: number; state: string | null }
      if (sib) {
        year = { name: sib.name, start_date: sib.start_date, end_date: sib.end_date, days_per_week: sib.days_per_week ?? 5, state: sib.state }
      } else {
        // No sibling year on record — compute the current school year (Aug–Jul); pull the
        // household state from any existing year if there is one.
        const now = new Date()
        const ys = now.getMonth() >= 7 ? now.getFullYear() : now.getFullYear() - 1
        const { data: anyYear } = await supabase.from('school_years').select('state').limit(1).maybeSingle()
        year = { name: `${ys}-${ys + 1}`, start_date: `${ys}-08-01`, end_date: `${ys + 1}-07-31`, days_per_week: 5, state: anyYear?.state ?? null }
      }
      await supabase.from('school_years').insert({
        user_id: user.id, child_id: (data as Child).id, is_active: true, ...year,
      })
    } catch { /* non-fatal — child added; year can be set in Setup */ }

    setChildren(prev => [...prev, data as Child])
    setAddForm({ name: '', grade_level: '', birthdate: '', learning_style: 'eclectic', color: 'green', learning_support: [], ai_notes: '' })
    setShowAdd(false)
    setSaving(false)
  }

  async function handleSave(childId: string) {
    if (!editForm.name?.trim()) { setError('Name is required.'); return }
    setSaving(true); setError('')

    const { data, error: err } = await supabase.from('children').update({
      name: editForm.name.trim(),
      birthdate: editForm.birthdate || null,
      grade_level: editForm.grade_level || null,
      learning_style: editForm.learning_style,
      color: editForm.color ?? 'green',
      learning_support: editForm.learning_support ?? [],
      ai_notes: (editForm.ai_notes ?? '').trim() || null,
    }).eq('id', childId).select().single()

    if (err) { setError(err.message); setSaving(false); return }
    setChildren(prev => prev.map(c => c.id === childId ? { ...c, ...data } : c))
    setEditingId(null)
    setSaving(false)
  }

  return (
    <div className="space-y-3">
      {children.map(child => {
        const colorDef = getChildColor(child.color)
        return (
          <div key={child.id} className="bg-elevated/60 border border-line-strong/60 rounded-xl p-4">
            {editingId === child.id ? (
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs text-subtle mb-1" htmlFor="name-1">Name</label>
                    <input id="name-1" type="text" value={editForm.name ?? ''}
                      onChange={e => setEditForm(f => ({ ...f, name: e.target.value }))}
                      className="w-full bg-card border border-line-strong h-9 rounded-lg px-3 text-sm text-content focus:outline-none focus:border-green-600" />
                  </div>
                  <div>
                    <label className="block text-xs text-subtle mb-1" htmlFor="grade-level-2">Grade Level</label>
                    <input id="grade-level-2" type="text" value={editForm.grade_level ?? ''} placeholder="e.g. 3rd grade"
                      onChange={e => setEditForm(f => ({ ...f, grade_level: e.target.value }))}
                      className="w-full bg-card border border-line-strong h-9 rounded-lg px-3 text-sm text-content placeholder-subtle focus:outline-none focus:border-green-600" />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs text-subtle mb-1" htmlFor="birthdate-3">Birthdate</label>
                    <input id="birthdate-3" type="date" value={editForm.birthdate ?? ''}
                      onChange={e => setEditForm(f => ({ ...f, birthdate: e.target.value }))}
                      className="appearance-none w-full bg-card border border-line-strong h-9 rounded-lg px-3 text-sm text-content focus:outline-none focus:border-green-600" />
                  </div>
                  <div>
                    <label className="block text-xs text-subtle mb-1" htmlFor="learning-style-4">Learning Style</label>
                    <select id="learning-style-4" value={editForm.learning_style ?? 'eclectic'}
                      onChange={e => setEditForm(f => ({ ...f, learning_style: e.target.value as Child['learning_style'] }))}
                      className="w-full bg-card border border-line-strong h-9 rounded-lg px-3 text-sm text-content focus:outline-none focus:border-green-600">
                      {LEARNING_STYLES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
                    </select>
                  </div>
                </div>

                {/* Color picker */}
                <div>
                  <span className="block text-xs text-subtle mb-2">Color</span>
                  <div className="flex gap-2 flex-wrap">
                    {CHILD_COLORS.map(c => (
                      <button key={c.key} type="button"
                        onClick={() => setEditForm(f => ({ ...f, color: c.key }))}
                        className={`w-7 h-7 rounded-full ${c.bg} transition-all ${editForm.color === c.key ? `ring-2 ring-offset-2 ring-offset-card ${c.ring}` : 'opacity-60 hover:opacity-100'}`}
                        title={c.label}
                      />
                    ))}
                  </div>
                </div>

                {/* Learning support */}
                <div>
                  <span className="block text-xs text-subtle mb-1">Learning differences <span className="text-subtle">(optional — helps AI tailor suggestions)</span></span>
                  <div className="flex flex-wrap gap-1.5">
                    {LEARNING_SUPPORT_OPTIONS.map(opt => {
                      const sel = (editForm.learning_support ?? []).includes(opt)
                      return (
                        <button key={opt} type="button"
                          onClick={() => setEditForm(f => ({ ...f, learning_support: toggleSupport(f.learning_support ?? [], opt) }))}
                          className={`px-2.5 py-1 rounded-full text-xs font-medium transition-colors ${sel ? 'bg-green-100 dark:bg-green-800/60 border border-green-700 text-green-800 dark:text-green-300' : 'bg-elevated border border-line-strong text-muted hover:bg-elevated'}`}>
                          {opt}
                        </button>
                      )
                    })}
                  </div>
                </div>

                {/* AI notes */}
                <div>
                  <label className="block text-xs text-subtle mb-1" htmlFor="notes-for-ai-1">Notes for AI <span className="text-subtle">(optional — e.g. &quot;learns best hands-on&quot;, &quot;loves animals&quot;)</span></label>
                  <textarea id="notes-for-ai-1" value={editForm.ai_notes ?? ''} rows={2}
                    onChange={e => setEditForm(f => ({ ...f, ai_notes: e.target.value }))}
                    placeholder="Anything else the AI should know about this learner..."
                    className="w-full bg-card border border-line-strong rounded-lg px-3 py-2 text-sm text-content placeholder-subtle resize-none focus:outline-none focus:border-green-600" />
                </div>

                {error && <p className="text-red-600 dark:text-red-400 text-xs">{error}</p>}
                <div className="flex gap-2 pt-1">
                  <button onClick={() => handleSave(child.id)} disabled={saving}
                    className="px-4 py-1.5 bg-green-700 hover:bg-green-600 disabled:opacity-50 text-white text-sm font-medium rounded-lg transition-colors">
                    {saving ? 'Saving...' : 'Save'}
                  </button>
                  <button onClick={() => setEditingId(null)}
                    className="px-4 py-1.5 text-muted hover:text-content text-sm transition-colors">
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className={`w-7 h-7 rounded-full ${colorDef.bg} flex items-center justify-center text-xs font-bold text-white shrink-0`}>
                    {child.name.charAt(0).toUpperCase()}
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-content">{child.name}</p>
                    <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                      {child.grade_level && <span className="text-xs text-subtle">{child.grade_level}</span>}
                      {child.learning_style && <span className="text-xs text-subtle capitalize">{child.learning_style.replace('_', ' ')}</span>}
                      {child.learning_support?.length > 0 && (
                        <span className="text-xs text-green-600">{child.learning_support.join(', ')}</span>
                      )}
                    </div>
                  </div>
                </div>
                <button onClick={() => startEdit(child)}
                  className="text-xs text-subtle hover:text-content transition-colors px-3 py-1.5 rounded-lg hover:bg-elevated">
                  Edit
                </button>
              </div>
            )}
          </div>
        )
      })}

      {/* Add child */}
      {showAdd ? (
        <div className="bg-elevated/60 border border-line-strong/60 rounded-xl p-4 space-y-4">
          <p className="text-xs font-semibold text-muted uppercase tracking-wider">Add Child</p>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-subtle mb-1" htmlFor="name-5">Name *</label>
              <input id="name-5" type="text" value={addForm.name}
                onChange={e => setAddForm(f => ({ ...f, name: e.target.value }))}
                className="w-full bg-card border border-line-strong h-9 rounded-lg px-3 text-sm text-content focus:outline-none focus:border-green-600" />
            </div>
            <div>
              <label className="block text-xs text-subtle mb-1" htmlFor="grade-level-6">Grade Level</label>
              <input id="grade-level-6" type="text" value={addForm.grade_level} placeholder="e.g. 3rd grade"
                onChange={e => setAddForm(f => ({ ...f, grade_level: e.target.value }))}
                className="w-full bg-card border border-line-strong h-9 rounded-lg px-3 text-sm text-content placeholder-subtle focus:outline-none focus:border-green-600" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-subtle mb-1" htmlFor="birthdate-7">Birthdate</label>
              <input id="birthdate-7" type="date" value={addForm.birthdate}
                onChange={e => setAddForm(f => ({ ...f, birthdate: e.target.value }))}
                className="appearance-none w-full bg-card border border-line-strong h-9 rounded-lg px-3 text-sm text-content focus:outline-none focus:border-green-600" />
            </div>
            <div>
              <label className="block text-xs text-subtle mb-1" htmlFor="learning-style-8">Learning Style</label>
              <select id="learning-style-8" value={addForm.learning_style}
                onChange={e => setAddForm(f => ({ ...f, learning_style: e.target.value }))}
                className="w-full bg-card border border-line-strong h-9 rounded-lg px-3 text-sm text-content focus:outline-none focus:border-green-600">
                {LEARNING_STYLES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
              </select>
            </div>
          </div>
          <div>
            <span className="block text-xs text-subtle mb-2">Color</span>
            <div className="flex gap-2 flex-wrap">
              {CHILD_COLORS.map(c => (
                <button key={c.key} type="button"
                  onClick={() => setAddForm(f => ({ ...f, color: c.key }))}
                  className={`w-7 h-7 rounded-full ${c.bg} transition-all ${addForm.color === c.key ? `ring-2 ring-offset-2 ring-offset-card ${c.ring}` : 'opacity-60 hover:opacity-100'}`}
                  title={c.label}
                />
              ))}
            </div>
          </div>
          <div>
            <span className="block text-xs text-subtle mb-1">Learning differences <span className="text-subtle">(optional)</span></span>
            <div className="flex flex-wrap gap-1.5">
              {LEARNING_SUPPORT_OPTIONS.map(opt => {
                const sel = addForm.learning_support.includes(opt)
                return (
                  <button key={opt} type="button"
                    onClick={() => setAddForm(f => ({ ...f, learning_support: toggleSupport(f.learning_support, opt) }))}
                    className={`px-2.5 py-1 rounded-full text-xs font-medium transition-colors ${sel ? 'bg-green-100 dark:bg-green-800/60 border border-green-700 text-green-800 dark:text-green-300' : 'bg-elevated border border-line-strong text-muted hover:bg-elevated'}`}>
                    {opt}
                  </button>
                )
              })}
            </div>
          </div>
          <div>
            <label className="block text-xs text-subtle mb-1" htmlFor="notes-for-ai-2">Notes for AI <span className="text-subtle">(optional)</span></label>
            <textarea id="notes-for-ai-2" value={addForm.ai_notes} rows={2}
              onChange={e => setAddForm(f => ({ ...f, ai_notes: e.target.value }))}
              placeholder="Anything that helps us tailor suggestions..."
              className="w-full bg-card border border-line-strong rounded-lg px-3 py-2 text-sm text-content placeholder-subtle resize-none focus:outline-none focus:border-green-600" />
          </div>
          {error && <p className="text-red-600 dark:text-red-400 text-xs">{error}</p>}
          <div className="flex gap-2 pt-1">
            <button onClick={handleAdd} disabled={saving}
              className="px-4 py-1.5 bg-green-700 hover:bg-green-600 disabled:opacity-50 text-white text-sm font-medium rounded-lg transition-colors">
              {saving ? 'Saving...' : 'Add Child'}
            </button>
            <button onClick={() => { setShowAdd(false); setError('') }}
              className="px-4 py-1.5 text-muted hover:text-content text-sm transition-colors">
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <button onClick={() => setShowAdd(true)}
          className="text-xs text-subtle hover:text-content transition-colors flex items-center gap-1.5 px-1">
          + Add another child
        </button>
      )}
    </div>
  )
}
