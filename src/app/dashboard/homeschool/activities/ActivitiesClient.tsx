'use client'

import { useToday, todayLocalISO } from '@/lib/use-today'
import { formatDateWeekday } from '@/lib/dates'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import type { Child, Subject, SchoolYear, Activity, ActivityType } from '@/lib/types'

const ACTIVITY_TYPES: { value: ActivityType; label: string }[] = [
  { value: 'field_trip', label: 'Field Trip' },
  { value: 'co_op', label: 'Co-op' },
  { value: 'community_service', label: 'Community Service' },
  { value: 'extracurricular', label: 'Extracurricular' },
  { value: 'other', label: 'Other' },
]


export default function ActivitiesClient({
  childList,
  subjects,
  activeYears,
  activities: initialActivities,
}: {
  childList: Child[]
  subjects: Subject[]
  activeYears: SchoolYear[]
  activities: Activity[]
}) {
  const router = useRouter()
  const supabase = createClient()

  const [showForm, setShowForm] = useState(false)
  const [activities, setActivities] = useState(initialActivities)

  const [childId, setChildId] = useState(childList[0]?.id ?? '')
  const [activityDate, setActivityDate] = useToday()
  const [type, setType] = useState<ActivityType | ''>('')
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [hours, setHours] = useState('')
  const [selectedSubjectIds, setSelectedSubjectIds] = useState<string[]>([])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const subjectMap: Record<string, string> = {}
  subjects.forEach(s => { subjectMap[s.id] = s.name })

  const childMap: Record<string, string> = {}
  childList.forEach(c => { childMap[c.id] = c.name })

  function toggleSubject(id: string) {
    setSelectedSubjectIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id])
  }

  async function handleSave() {
    if (!title.trim()) { setError('Give it a title.'); return }
    if (!childId) { setError('Select a child.'); return }
    setSaving(true)
    setError('')

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { router.push('/login'); return }

    const activeYear = activeYears.find(y => y.child_id === childId)

    const { data, error: err } = await supabase.from('activities').insert({
      user_id: user.id,
      child_id: childId,
      school_year_id: activeYear?.id ?? null,
      activity_date: activityDate,
      type: type || null,
      title: title.trim(),
      description: description.trim() || null,
      hours: hours ? parseFloat(hours) : null,
      subject_ids: selectedSubjectIds,
    }).select().single()

    if (err) { setError(err.message); setSaving(false); return }

    setActivities(prev => [data as Activity, ...prev])
    setShowForm(false)
    setTitle('')
    setDescription('')
    setHours('')
    setType('')
    setSelectedSubjectIds([])
    setActivityDate(todayLocalISO())
    setSaving(false)
  }

  async function deleteActivity(id: string) {
    await supabase.from('activities').delete().eq('id', id)
    setActivities(prev => prev.filter(a => a.id !== id))
  }

  return (
    <main className="max-w-2xl mx-auto px-6 py-8">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h2 className="text-xl font-bold">Activities</h2>
          <p className="text-muted text-sm mt-0.5">Field trips, co-ops, community service, extracurriculars.</p>
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
              <label className="block text-xs font-medium text-muted uppercase tracking-wider mb-2" htmlFor="date-1">Date</label>
              <input id="date-1" type="date" value={activityDate} onChange={e => setActivityDate(e.target.value)}
                className="appearance-none w-full bg-elevated border border-line-strong h-10 rounded-lg px-4 py-2.5 text-content focus:outline-none focus:border-green-600 text-sm" />
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-muted uppercase tracking-wider mb-2" htmlFor="title-2">Title</label>
            <input id="title-2" type="text" value={title} onChange={e => setTitle(e.target.value)}
              placeholder="e.g. Visit to natural history museum"
              className="w-full bg-elevated border border-line-strong h-10 rounded-lg px-4 py-2.5 text-content placeholder-subtle focus:outline-none focus:border-green-600 text-sm" />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-muted uppercase tracking-wider mb-2" htmlFor="type-3">Type</label>
              <select id="type-3" value={type} onChange={e => setType(e.target.value as ActivityType | '')}
                className="w-full bg-elevated border border-line-strong h-10 rounded-lg px-4 py-2.5 text-content focus:outline-none focus:border-green-600 text-sm">
                <option value="">— select —</option>
                {ACTIVITY_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-muted uppercase tracking-wider mb-2" htmlFor="hours-4">Hours</label>
              <input id="hours-4" type="number" value={hours} onChange={e => setHours(e.target.value)}
                min="0" max="24" step="0.5" placeholder="e.g. 3"
                className="w-full bg-elevated border border-line-strong h-10 rounded-lg px-4 py-2.5 text-content placeholder-subtle focus:outline-none focus:border-green-600 text-sm" />
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-muted uppercase tracking-wider mb-2" htmlFor="notes-optional-5">Notes (optional)</label>
            <textarea id="notes-optional-5" value={description} onChange={e => setDescription(e.target.value)}
              placeholder="What you did, what you learned..."
              rows={2}
              className="w-full bg-elevated border border-line-strong rounded-lg px-4 py-3 text-content placeholder-subtle focus:outline-none focus:border-green-600 resize-none text-sm" />
          </div>

          {subjects.length > 0 && (
            <div>
              <span className="block text-xs font-medium text-muted uppercase tracking-wider mb-2">Subjects covered</span>
              <div className="flex flex-wrap gap-2">
                {subjects.filter(s => s.child_id === childId || !childId).map(s => (
                  <button key={s.id} type="button" onClick={() => toggleSubject(s.id)}
                    className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
                      selectedSubjectIds.includes(s.id) ? 'bg-green-700 text-white' : 'bg-line-strong text-content hover:bg-stone-600'
                    }`}>
                    {s.name}
                  </button>
                ))}
              </div>
            </div>
          )}

          {error && <p className="text-red-600 dark:text-red-400 text-sm">{error}</p>}

          <button onClick={handleSave} disabled={saving}
            className="w-full bg-green-700 hover:bg-green-600 disabled:opacity-50 text-white font-bold py-3 rounded-xl transition-colors">
            {saving ? 'Saving...' : 'Save Activity'}
          </button>
        </div>
      )}

      {activities.length === 0 ? (
        <div className="text-center py-16">
          <div className="text-4xl mb-3">🏕</div>
          <h2 className="text-lg font-semibold mb-2">No activities yet</h2>
          <p className="text-muted text-sm">Log field trips, co-ops, and extracurriculars here.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {activities.map(a => (
            <div key={a.id} className="bg-card border border-line rounded-xl p-4">
              <div className="flex items-start justify-between mb-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-semibold text-sm">{a.title}</span>
                  {a.type && (
                    <span className="text-xs bg-elevated text-muted px-2 py-0.5 rounded-full capitalize">
                      {a.type.replace('_', ' ')}
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-2 shrink-0 ml-2">
                  {a.hours && <span className="text-xs text-subtle">{a.hours}h</span>}
                  <span className="text-xs text-subtle">{formatDateWeekday(a.activity_date)}</span>
                  <button onClick={() => deleteActivity(a.id)} className="text-xs text-red-500 hover:text-red-600 dark:hover:text-red-400 transition-colors">×</button>
                </div>
              </div>
              {childList.length > 1 && <p className="text-xs text-subtle">{childMap[a.child_id]}</p>}
              {a.description && <p className="text-sm text-muted mt-1">{a.description}</p>}
              {a.subject_ids?.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mt-2">
                  {a.subject_ids.map(id => (
                    <span key={id} className="text-xs bg-elevated text-muted px-2 py-0.5 rounded-full">{subjectMap[id] ?? id}</span>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </main>
  )
}
