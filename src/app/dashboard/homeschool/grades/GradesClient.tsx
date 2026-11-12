'use client'

import { useToday } from '@/lib/use-today'
import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import type { Child, Subject, SchoolYear } from '@/lib/types'

interface Grade {
  id: string
  subject_id: string
  child_id: string
  period: string | null
  value: string | null
  numeric_value: number | null
  notes: string | null
  graded_at: string
}

const LETTER_GRADES = ['A+', 'A', 'A-', 'B+', 'B', 'B-', 'C+', 'C', 'C-', 'D', 'F', 'Pass', 'Fail', 'Mastered', 'In Progress', 'Not Yet']

function gradeColor(value: string | null) {
  if (!value) return 'text-muted'
  const v = value.toUpperCase()
  if (v.startsWith('A') || v === 'PASS' || v === 'MASTERED') return 'text-green-600 dark:text-green-400'
  if (v.startsWith('B')) return 'text-blue-600 dark:text-blue-400'
  if (v.startsWith('C')) return 'text-amber-600 dark:text-amber-400'
  return 'text-red-600 dark:text-red-400'
}

export default function GradesClient({
  childList,
  subjects,
  grades: initialGrades,
  activeYears,
}: {
  childList: Child[]
  subjects: Subject[]
  grades: Grade[]
  activeYears: SchoolYear[]
}) {
  const router = useRouter()
  const supabase = createClient()

  const [selectedChild, setSelectedChild] = useState(childList[0]?.id ?? '')
  const [grades, setGrades] = useState(initialGrades)
  const [showAdd, setShowAdd] = useState(false)
  const [subjectId, setSubjectId] = useState('')
  const [period, setPeriod] = useState('')
  const [value, setValue] = useState('')
  const [numericValue, setNumericValue] = useState('')
  const [notes, setNotes] = useState('')
  const [gradedAt, setGradedAt] = useToday()
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const activeYear = activeYears.find(y => y.child_id === selectedChild)
  const childSubjects = subjects.filter(s => s.child_id === selectedChild)
  const childGrades = grades.filter(g => g.child_id === selectedChild)

  const gradesBySubject: Record<string, Grade[]> = {}
  childGrades.forEach(g => {
    if (!gradesBySubject[g.subject_id]) gradesBySubject[g.subject_id] = []
    gradesBySubject[g.subject_id].push(g)
  })

  async function addGrade() {
    if (!subjectId || !value) return
    setSaving(true)
    setError('')

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { router.push('/login'); return }

    const { data, error: err } = await supabase
      .from('grades')
      .insert({
        user_id: user.id,
        child_id: selectedChild,
        subject_id: subjectId,
        period: period || null,
        value,
        numeric_value: numericValue ? parseFloat(numericValue) : null,
        notes: notes || null,
        graded_at: gradedAt,
      })
      .select()
      .single()

    if (err) { setError(err.message); setSaving(false); return }
    setGrades(prev => [data as Grade, ...prev])
    setSubjectId('')
    setPeriod('')
    setValue('')
    setNumericValue('')
    setNotes('')
    setShowAdd(false)
    setSaving(false)
  }

  async function deleteGrade(id: string) {
    await supabase.from('grades').delete().eq('id', id)
    setGrades(prev => prev.filter(g => g.id !== id))
  }

  return (
    <div className="min-h-screen bg-surface text-content">
      <nav className="border-b border-line/60 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link href="/dashboard/homeschool" className="text-subtle hover:text-content text-sm transition-colors">← Homeschool</Link>
          <span className="text-subtle">/</span>
          <span className="text-sm font-semibold text-green-600 dark:text-green-400">Grades</span>
        </div>
        {activeYear && <span className="text-subtle text-xs">{activeYear.name}</span>}
      </nav>

      <main className="max-w-2xl mx-auto px-6 py-8">
        {childList.length > 1 && (
          <div className="flex gap-2 mb-6">
            {childList.map(c => (
              <button key={c.id} onClick={() => setSelectedChild(c.id)}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${selectedChild === c.id ? 'bg-green-700 text-white' : 'bg-elevated text-content hover:bg-elevated'}`}>
                {c.name}
              </button>
            ))}
          </div>
        )}

        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-bold">{childList.find(c => c.id === selectedChild)?.name}&apos;s Grades</h2>
          <button onClick={() => setShowAdd(true)}
            className="bg-green-700 hover:bg-green-600 text-white text-sm font-semibold px-4 py-2 rounded-lg transition-colors">
            + Add Grade
          </button>
        </div>

        {/* Add form */}
        {showAdd && (
          <div className="bg-card border border-line-strong rounded-xl p-5 mb-6">
            <h3 className="font-semibold mb-4">New Grade Entry</h3>
            <div className="space-y-3">
              <select value={subjectId} onChange={e => setSubjectId(e.target.value)}
                className="w-full bg-elevated border border-line-strong h-10 rounded-lg px-4 py-2.5 text-content focus:outline-none focus:border-green-600">
                <option value="">Select subject...</option>
                {childSubjects.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>

              <div className="grid grid-cols-2 gap-3">
                <input type="text" value={period} onChange={e => setPeriod(e.target.value)}
                  placeholder="Period (e.g. Q1, Semester 1)"
                  className="w-full bg-elevated border border-line-strong h-10 rounded-lg px-4 py-2.5 text-content placeholder-subtle focus:outline-none focus:border-green-600" />
                <input type="date" value={gradedAt} onChange={e => setGradedAt(e.target.value)}
                  className="appearance-none w-full bg-elevated border border-line-strong h-10 rounded-lg px-4 py-2.5 text-content focus:outline-none focus:border-green-600" />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <p className="text-xs text-muted mb-2">Grade</p>
                  <div className="flex flex-wrap gap-1.5 mb-2">
                    {LETTER_GRADES.map(g => (
                      <button key={g} onClick={() => setValue(g)}
                        className={`px-2 py-1 rounded text-xs font-medium transition-colors ${value === g ? 'bg-green-700 text-white' : 'bg-elevated text-content hover:bg-elevated'}`}>
                        {g}
                      </button>
                    ))}
                  </div>
                  <input type="text" value={value} onChange={e => setValue(e.target.value)}
                    placeholder="Or type custom..."
                    className="w-full bg-elevated border border-line-strong h-10 rounded-lg px-3 py-2 text-content placeholder-subtle focus:outline-none focus:border-green-600 text-sm" />
                </div>
                <div>
                  <p className="text-xs text-muted mb-2">Numeric (optional)</p>
                  <input type="number" value={numericValue} onChange={e => setNumericValue(e.target.value)}
                    min="0" max="100" step="0.1" placeholder="e.g. 94.5"
                    className="w-full bg-elevated border border-line-strong h-10 rounded-lg px-4 py-2.5 text-content placeholder-subtle focus:outline-none focus:border-green-600" />
                </div>
              </div>

              <input type="text" value={notes} onChange={e => setNotes(e.target.value)}
                placeholder="Notes (optional)"
                className="w-full bg-elevated border border-line-strong h-10 rounded-lg px-4 py-2.5 text-content placeholder-subtle focus:outline-none focus:border-green-600" />
            </div>

            {error && <p className="text-red-600 dark:text-red-400 text-sm mt-3">{error}</p>}

            <div className="flex gap-3 mt-4">
              <button onClick={addGrade} disabled={saving || !subjectId || !value}
                className="bg-green-700 hover:bg-green-600 disabled:opacity-50 text-white font-semibold px-5 py-2 rounded-lg text-sm transition-colors">
                {saving ? 'Saving...' : 'Save'}
              </button>
              <button onClick={() => { setShowAdd(false); setError('') }}
                className="text-muted hover:text-content text-sm transition-colors">
                Cancel
              </button>
            </div>
          </div>
        )}

        {/* Grades by subject */}
        {childSubjects.length === 0 ? (
          <div className="text-center py-16 text-subtle">
            <div className="text-4xl mb-3">📊</div>
            <p className="text-sm">Add subjects first, then record grades here.</p>
            <Link href="/dashboard/homeschool/subjects" className="text-green-500 text-sm hover:text-green-400 mt-2 inline-block">
              Go to Subjects →
            </Link>
          </div>
        ) : (
          <div className="space-y-6">
            {childSubjects.map(subject => {
              const sg = gradesBySubject[subject.id] ?? []
              return (
                <div key={subject.id} className="bg-card border border-line rounded-xl overflow-hidden">
                  <div className="px-4 py-3 border-b border-line flex items-center justify-between">
                    <h3 className="font-semibold text-sm">{subject.name}</h3>
                    {sg.length > 0 && (
                      <span className="text-xs text-subtle">{sg.length} {sg.length === 1 ? 'entry' : 'entries'}</span>
                    )}
                  </div>
                  {sg.length === 0 ? (
                    <div className="px-4 py-3 text-xs text-subtle">No grades recorded yet.</div>
                  ) : (
                    <div className="divide-y divide-line">
                      {sg.map(g => (
                        <div key={g.id} className="px-4 py-3 flex items-center justify-between">
                          <div className="flex items-center gap-4">
                            <span className={`text-lg font-bold ${gradeColor(g.value)}`}>{g.value}</span>
                            {g.numeric_value !== null && (
                              <span className="text-xs text-muted">{g.numeric_value}%</span>
                            )}
                            <div>
                              {g.period && <div className="text-xs text-muted">{g.period}</div>}
                              {g.notes && <div className="text-xs text-subtle">{g.notes}</div>}
                            </div>
                          </div>
                          <div className="flex items-center gap-3">
                            <span className="text-xs text-subtle">{g.graded_at}</span>
                            <button onClick={() => deleteGrade(g.id)} className="text-xs text-red-500 hover:text-red-400 transition-colors">×</button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </main>
    </div>
  )
}
