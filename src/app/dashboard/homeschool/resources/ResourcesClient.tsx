'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import type { Child, Subject, SchoolYear, Resource, ResourceType } from '@/lib/types'
import { todayLocalISO } from '@/lib/use-today'

const RESOURCE_TYPES: { value: ResourceType; label: string; icon: string }[] = [
  { value: 'book', label: 'Book', icon: '📚' },
  { value: 'curriculum', label: 'Curriculum', icon: '🎓' },
  { value: 'website', label: 'Website', icon: '🌐' },
  { value: 'video', label: 'Video', icon: '▶️' },
  { value: 'material', label: 'Material', icon: '🖊️' },
  { value: 'other', label: 'Other', icon: '📋' },
]

export default function ResourcesClient({
  childList,
  subjects,
  activeYears,
  resources: initialResources,
}: {
  childList: Child[]
  subjects: Subject[]
  activeYears: SchoolYear[]
  resources: Resource[]
}) {
  const router = useRouter()
  const supabase = createClient()

  const [showForm, setShowForm] = useState(false)
  const [resources, setResources] = useState(initialResources)

  const [childId, setChildId] = useState(childList[0]?.id ?? '')
  const [title, setTitle] = useState('')
  const [type, setType] = useState<ResourceType | ''>('')
  const [subjectId, setSubjectId] = useState('')
  const [notes, setNotes] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const subjectMap: Record<string, string> = {}
  subjects.forEach(s => { subjectMap[s.id] = s.name })

  const childMap: Record<string, string> = {}
  childList.forEach(c => { childMap[c.id] = c.name })

  const childSubjects = subjects.filter(s => s.child_id === childId || !childId)

  async function handleSave() {
    if (!title.trim()) { setError('Give it a title.'); return }
    if (!childId) { setError('Select a child.'); return }
    setSaving(true)
    setError('')

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { router.push('/login'); return }

    const activeYear = activeYears.find(y => y.child_id === childId)

    const { data, error: err } = await supabase.from('resources').insert({
      user_id: user.id,
      child_id: childId,
      school_year_id: activeYear?.id ?? null,
      title: title.trim(),
      type: type || null,
      subject_id: subjectId || null,
      notes: notes.trim() || null,
      acquired_at: todayLocalISO(),
    }).select().single()

    if (err) { setError(err.message); setSaving(false); return }

    setResources(prev => [data as Resource, ...prev])
    setShowForm(false)
    setTitle('')
    setType('')
    setSubjectId('')
    setNotes('')
    setSaving(false)
  }

  async function deleteResource(id: string) {
    await supabase.from('resources').delete().eq('id', id)
    setResources(prev => prev.filter(r => r.id !== id))
  }

  const grouped = RESOURCE_TYPES.reduce((acc, t) => {
    const items = resources.filter(r => r.type === t.value || (!r.type && t.value === 'other'))
    if (items.length > 0) acc[t.value] = items
    return acc
  }, {} as Record<string, Resource[]>)

  const untyped = resources.filter(r => !r.type)

  return (
    <main className="max-w-2xl mx-auto px-6 py-8">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h2 className="text-xl font-bold">Books & Curriculum</h2>
          <p className="text-muted text-sm mt-0.5">Books, curriculum, websites, and materials.</p>
        </div>
        <button
          onClick={() => setShowForm(!showForm)}
          className="bg-green-700 hover:bg-green-600 text-white text-sm font-semibold px-4 py-2 rounded-lg transition-colors"
        >
          {showForm ? 'Cancel' : '+ Add'}
        </button>
      </div>

      {showForm && (
        <div className="bg-card border border-line-strong rounded-xl p-6 mb-8 space-y-5">
          <div>
            <label className="block text-xs font-medium text-muted uppercase tracking-wider mb-2" htmlFor="title-1">Title</label>
            <input id="title-1" type="text" value={title} onChange={e => setTitle(e.target.value)}
              placeholder="e.g. Charlotte's Web, Khan Academy, Science kit..."
              className="w-full bg-elevated border border-line-strong h-10 rounded-lg px-4 py-2.5 text-content placeholder-subtle focus:outline-none focus:border-green-600 text-sm" />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <span className="block text-xs font-medium text-muted uppercase tracking-wider mb-2">Child</span>
              {childList.length === 1 ? (
                <div className="h-10 bg-elevated border border-line-strong rounded-lg px-4 py-2.5 font-medium text-sm flex items-center">{childList[0].name}</div>
              ) : (
                <select value={childId} onChange={e => setChildId(e.target.value)}
                  className="w-full bg-elevated border border-line-strong h-10 rounded-lg px-4 py-2.5 text-content focus:outline-none focus:border-green-600 text-sm">
                  {childList.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              )}
            </div>
            <div>
              <label className="block text-xs font-medium text-muted uppercase tracking-wider mb-2" htmlFor="type-2">Type</label>
              <select id="type-2" value={type} onChange={e => setType(e.target.value as ResourceType | '')}
                className="w-full bg-elevated border border-line-strong h-10 rounded-lg px-4 py-2.5 text-content focus:outline-none focus:border-green-600 text-sm">
                <option value="">— select —</option>
                {RESOURCE_TYPES.map(t => <option key={t.value} value={t.value}>{t.icon} {t.label}</option>)}
              </select>
            </div>
          </div>

          {childSubjects.length > 0 && (
            <div>
              <label className="block text-xs font-medium text-muted uppercase tracking-wider mb-2" htmlFor="subject-optional-3">Subject (optional)</label>
              <select id="subject-optional-3" value={subjectId} onChange={e => setSubjectId(e.target.value)}
                className="w-full bg-elevated border border-line-strong h-10 rounded-lg px-4 py-2.5 text-content focus:outline-none focus:border-green-600 text-sm">
                <option value="">— none —</option>
                {childSubjects.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </div>
          )}

          <div>
            <label className="block text-xs font-medium text-muted uppercase tracking-wider mb-2" htmlFor="notes-optional-4">Notes (optional)</label>
            <textarea id="notes-optional-4" value={notes} onChange={e => setNotes(e.target.value)}
              placeholder="Author, URL, notes..."
              rows={2}
              className="w-full bg-elevated border border-line-strong rounded-lg px-4 py-3 text-content placeholder-subtle focus:outline-none focus:border-green-600 resize-none text-sm" />
          </div>

          {error && <p className="text-red-600 dark:text-red-400 text-sm">{error}</p>}

          <button onClick={handleSave} disabled={saving}
            className="w-full bg-green-700 hover:bg-green-600 disabled:opacity-50 text-white font-bold py-3 rounded-xl transition-colors">
            {saving ? 'Saving...' : 'Save Resource'}
          </button>
        </div>
      )}

      {resources.length === 0 ? (
        <div className="text-center py-16">
          <div className="text-4xl mb-3">📖</div>
          <h2 className="text-lg font-semibold mb-2">No resources yet</h2>
          <p className="text-muted text-sm">Track books read, curriculum used, and websites.</p>
        </div>
      ) : (
        <div className="space-y-6">
          {RESOURCE_TYPES.map(t => {
            const items = resources.filter(r => r.type === t.value)
            if (items.length === 0) return null
            return (
              <section key={t.value}>
                <h3 className="text-xs font-semibold text-subtle uppercase tracking-wider mb-3">
                  {t.icon} {t.label}s
                </h3>
                <div className="space-y-2">
                  {items.map(r => (
                    <div key={r.id} className="bg-card border border-line rounded-xl px-4 py-3 flex items-start justify-between">
                      <div>
                        <span className="font-medium text-sm">{r.title}</span>
                        {childList.length > 1 && <span className="text-xs text-subtle ml-2">{childMap[r.child_id]}</span>}
                        {r.subject_id && <span className="text-xs text-subtle ml-2">· {subjectMap[r.subject_id]}</span>}
                        {r.notes && <p className="text-xs text-muted mt-0.5">{r.notes}</p>}
                      </div>
                      <button onClick={() => deleteResource(r.id)} className="text-xs text-red-500 hover:text-red-600 dark:hover:text-red-400 transition-colors shrink-0 ml-2">×</button>
                    </div>
                  ))}
                </div>
              </section>
            )
          })}
          {untyped.length > 0 && (
            <section>
              <h3 className="text-xs font-semibold text-subtle uppercase tracking-wider mb-3">Other</h3>
              <div className="space-y-2">
                {untyped.map(r => (
                  <div key={r.id} className="bg-card border border-line rounded-xl px-4 py-3 flex items-start justify-between">
                    <div>
                      <span className="font-medium text-sm">{r.title}</span>
                      {r.notes && <p className="text-xs text-muted mt-0.5">{r.notes}</p>}
                    </div>
                    <button onClick={() => deleteResource(r.id)} className="text-xs text-red-500 hover:text-red-600 dark:hover:text-red-400 transition-colors shrink-0 ml-2">×</button>
                  </div>
                ))}
              </div>
            </section>
          )}
        </div>
      )}
    </main>
  )
}
