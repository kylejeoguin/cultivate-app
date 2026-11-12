'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import WeeklyBoard from './WeeklyBoard'
import type { Child, Subject, SchoolYear, PlannerWeek, PlannerItem } from '@/lib/types'

export default function CurriculumClient({
  childList, subjects, schoolYears: initialYears, plannerWeeks, plannerItems,
}: {
  childList: Child[]
  subjects: Subject[]
  schoolYears: SchoolYear[]
  plannerWeeks: PlannerWeek[]
  plannerItems: PlannerItem[]
}) {
  const router = useRouter()
  const supabase = createClient()

  const [schoolYears, setSchoolYears] = useState(initialYears)
  // Subjects are lifted to state so a subject created inline from the planner
  // (Daily basics / Loop / a day block) appears immediately everywhere.
  const [allSubjects, setAllSubjects] = useState(subjects)
  const addSubject = (s: Subject) =>
    setAllSubjects(prev => prev.some(x => x.id === s.id) ? prev : [...prev, s])
  const [showNewYear, setShowNewYear] = useState(false)
  const [busy, setBusy] = useState(false)

  function defaultYearFor(childId: string): string {
    const ys = schoolYears.filter(y => y.child_id === childId)
    return (ys.find(y => y.is_active) ?? ys[ys.length - 1])?.id ?? ''
  }

  const [selectedChild, setSelectedChild] = useState(childList[0]?.id ?? '')
  const [selectedYearId, setSelectedYearId] = useState(defaultYearFor(childList[0]?.id ?? ''))

  function pickChild(childId: string) {
    setSelectedChild(childId)
    setSelectedYearId(defaultYearFor(childId))
    setShowNewYear(false)
  }

  const childYears = schoolYears
    .filter(y => y.child_id === selectedChild)
    .sort((a, b) => (a.start_date ?? '').localeCompare(b.start_date ?? ''))
  const selectedYear = childYears.find(y => y.id === selectedYearId)

  // Subjects for the selected (child, year) — the planner's subject backbone.
  // Legacy subjects with a null year show under the active year.
  const childSubjects = allSubjects.filter(s =>
    s.child_id === selectedChild &&
    (s.school_year_id === selectedYearId || (s.school_year_id == null && !!selectedYear?.is_active))
  )

  async function createYear(name: string, start: string, end: string) {
    if (!name.trim() || !start || !end || busy) return
    setBusy(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { router.push('/login'); setBusy(false); return }
    const template = childYears[childYears.length - 1] ?? childYears[0]
    const { data, error } = await supabase.from('school_years').insert({
      user_id: user.id, child_id: selectedChild, name: name.trim(),
      start_date: start, end_date: end,
      days_per_week: template?.days_per_week ?? 4,
      state: template?.state ?? '',
      is_active: false,
    }).select().single()
    if (!error && data) {
      const newYear = data as SchoolYear
      setSchoolYears(prev => [...prev, newYear])
      setSelectedYearId(newYear.id)
      setShowNewYear(false)
    }
    setBusy(false)
  }

  return (
    <div className="min-h-screen bg-surface text-content">
      <nav className="border-b border-line px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link href="/dashboard/homeschool" className="text-subtle hover:text-content text-sm transition-colors">← Homeschool</Link>
          <span className="text-subtle">/</span>
          <span className="text-sm font-semibold text-green-600 dark:text-green-400">Planner</span>
        </div>
      </nav>

      <main className="max-w-5xl mx-auto px-6 py-8">
        <div className="mb-6">
          <h2 className="text-xl font-bold mb-1">Weekly Planner</h2>
          <p className="text-muted text-sm">
            Plan your week, your way — flexibility isn&rsquo;t failure. Blank boxes are fine,
            slide anything forward, and reuse what works.
          </p>
        </div>

        {/* Child selector */}
        {childList.length > 1 && (
          <div className="flex gap-2 flex-wrap mb-4">
            {childList.map(c => (
              <button key={c.id} onClick={() => pickChild(c.id)}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                  selectedChild === c.id ? 'bg-green-700 text-white' : 'bg-elevated text-muted hover:text-content'
                }`}>
                {c.name}
              </button>
            ))}
          </div>
        )}

        {/* Year switcher */}
        <div className="flex items-center gap-2 flex-wrap mb-6">
          <span className="text-xs text-subtle uppercase tracking-wider">School year</span>
          {childYears.length > 0 && (
            <select
              value={selectedYearId}
              onChange={e => setSelectedYearId(e.target.value)}
              className="bg-elevated border border-line-strong rounded-lg px-3 py-1.5 text-sm text-content focus:outline-none focus:border-green-600"
            >
              {childYears.map(y => (
                <option key={y.id} value={y.id} className="bg-card text-content">
                  {y.name}{y.is_active ? ' (current)' : ''}
                </option>
              ))}
            </select>
          )}
          <button onClick={() => setShowNewYear(v => !v)}
            className="text-xs text-green-600 dark:text-green-400 hover:underline">
            {showNewYear ? 'Cancel' : '+ New year'}
          </button>
        </div>

        {showNewYear && <NewYearForm busy={busy} onCreate={createYear} />}

        {selectedChild && (
          <WeeklyBoard
            selectedChild={selectedChild}
            selectedYearId={selectedYearId}
            subjects={childSubjects}
            onSubjectCreated={addSubject}
            initialWeeks={plannerWeeks}
            initialItems={plannerItems}
          />
        )}
      </main>
    </div>
  )
}

function NewYearForm({ busy, onCreate }: {
  busy: boolean
  onCreate: (name: string, start: string, end: string) => void
}) {
  const [name, setName] = useState('')
  const [start, setStart] = useState('')
  const [end, setEnd] = useState('')

  return (
    <div className="bg-card border border-line rounded-xl p-4 mb-6 space-y-3 max-w-md">
      <p className="text-sm font-semibold">Plan a new school year</p>
      <input type="text" value={name} onChange={e => setName(e.target.value)}
        placeholder="Year name (e.g. 2027 School Year)"
        className="w-full bg-elevated border border-line-strong rounded-lg px-3 py-1.5 text-sm text-content placeholder-subtle focus:outline-none focus:border-green-600" />
      <div className="flex gap-2">
        <label className="flex-1 text-xs text-subtle">Start
          <input type="date" value={start} onChange={e => setStart(e.target.value)}
            className="mt-1 w-full bg-elevated border border-line-strong rounded-lg px-2 py-1.5 text-sm text-content focus:outline-none focus:border-green-600" />
        </label>
        <label className="flex-1 text-xs text-subtle">End
          <input type="date" value={end} onChange={e => setEnd(e.target.value)}
            className="mt-1 w-full bg-elevated border border-line-strong rounded-lg px-2 py-1.5 text-sm text-content focus:outline-none focus:border-green-600" />
        </label>
      </div>
      <button onClick={() => onCreate(name, start, end)}
        disabled={busy || !name.trim() || !start || !end}
        className="bg-green-700 hover:bg-green-600 disabled:opacity-40 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors">
        {busy ? 'Creating…' : 'Create year'}
      </button>
    </div>
  )
}
