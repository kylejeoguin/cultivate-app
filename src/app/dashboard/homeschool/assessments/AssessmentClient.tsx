'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import type { Child } from '@/lib/types'
import { todayLocalISO } from '@/lib/use-today'

const ASSESSMENT_TYPES = [
  { value: 'standardized_test', label: 'Standardized Test' },
  { value: 'portfolio_review', label: 'Portfolio Review' },
  { value: 'evaluator_assessment', label: 'Evaluator Assessment' },
  { value: 'self_assessment', label: 'Self Assessment' },
  { value: 'other', label: 'Other' },
]

interface Assessment {
  id: string
  child_id: string
  assessment_date: string
  type: string
  title: string
  administered_by: string | null
  results: string | null
  notes: string | null
}

function fmt(d: string) {
  return new Date(d + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

export default function AssessmentClient({
  initialAssessments, childList,
}: {
  initialAssessments: Assessment[]
  childList: Child[]
}) {
  const router = useRouter()
  const supabase = createClient()
  const [assessments, setAssessments] = useState(initialAssessments)
  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [form, setForm] = useState({
    child_id: childList[0]?.id ?? '',
    assessment_date: new Date().toISOString().slice(0, 10),
    type: 'standardized_test',
    title: '',
    administered_by: '',
    results: '',
    notes: '',
  })

  // The initializer above runs UTC-stable for SSR; correct the default to the
  // user's LOCAL today on mount (no hydration mismatch, right date in the evening).
  useEffect(() => { setForm(f => ({ ...f, assessment_date: todayLocalISO() })) }, [])

  const childMap: Record<string, string> = {}
  childList.forEach(c => { childMap[c.id] = c.name })

  function typeLabel(type: string) {
    return ASSESSMENT_TYPES.find(t => t.value === type)?.label ?? type
  }

  function startEdit(a: Assessment) {
    setEditingId(a.id)
    setForm({
      child_id: a.child_id,
      assessment_date: a.assessment_date,
      type: a.type,
      title: a.title,
      administered_by: a.administered_by ?? '',
      results: a.results ?? '',
      notes: a.notes ?? '',
    })
    setShowForm(true)
  }

  function resetForm() {
    setForm({ child_id: childList[0]?.id ?? '', assessment_date: todayLocalISO(), type: 'standardized_test', title: '', administered_by: '', results: '', notes: '' })
    setEditingId(null)
    setShowForm(false)
    setError('')
  }

  async function handleSave() {
    if (!form.title.trim()) { setError('Title is required.'); return }
    if (!form.child_id) { setError('Select a child.'); return }
    setSaving(true); setError('')
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    const payload = {
      user_id: user.id,
      child_id: form.child_id,
      assessment_date: form.assessment_date,
      type: form.type,
      title: form.title.trim(),
      administered_by: form.administered_by.trim() || null,
      results: form.results.trim() || null,
      notes: form.notes.trim() || null,
    }

    if (editingId) {
      const { data, error: err } = await supabase.from('assessment_logs').update(payload).eq('id', editingId).select().single()
      if (err) { setError(err.message); setSaving(false); return }
      setAssessments(prev => prev.map(a => a.id === editingId ? data as Assessment : a))
    } else {
      const { data, error: err } = await supabase.from('assessment_logs').insert(payload).select().single()
      if (err) { setError(err.message); setSaving(false); return }
      setAssessments(prev => [data as Assessment, ...prev])
    }
    setSaving(false)
    resetForm()
    router.refresh()
  }

  async function handleDelete(id: string) {
    await supabase.from('assessment_logs').delete().eq('id', id)
    setAssessments(prev => prev.filter(a => a.id !== id))
  }

  return (
    <div className="min-h-screen bg-surface text-content">
      <nav className="border-b border-line/60 px-6 py-4 flex items-center gap-3">
        <Link href="/dashboard/homeschool" className="text-subtle hover:text-content text-sm transition-colors">← Homeschool</Link>
        <span className="text-subtle">/</span>
        <span className="text-sm font-semibold text-green-600 dark:text-green-400">Assessments</span>
      </nav>

      <main className="max-w-2xl mx-auto px-6 py-8 pb-24">
        <div className="flex items-start justify-between mb-6">
          <div>
            <h2 className="text-xl font-bold mb-1">Assessments</h2>
            <p className="text-muted text-sm">Log standardized tests, portfolio reviews, and evaluator assessments. Required in many states.</p>
          </div>
          <button onClick={() => { resetForm(); setShowForm(true) }}
            className="shrink-0 ml-4 bg-green-700 hover:bg-green-600 text-white text-sm font-semibold px-4 py-2 rounded-lg transition-colors">
            + Add
          </button>
        </div>

        {/* Info banner */}
        <div className="bg-card/60 border border-line rounded-xl px-4 py-3 mb-6 flex items-start gap-3">
          <span className="text-amber-600 dark:text-amber-400 text-base shrink-0">ℹ</span>
          <p className="text-xs text-muted leading-relaxed">
            About 20 states require annual standardized testing or evaluation. Records logged here appear in your compliance dashboard and PDF transcript.{' '}
            <a href="https://hslda.org/legal" target="_blank" rel="noopener noreferrer" className="text-green-500 hover:underline">Check your state&apos;s requirements →</a>
          </p>
        </div>

        {/* Form */}
        {showForm && (
          <div className="bg-card border border-line rounded-xl p-5 mb-6 space-y-4">
            <p className="text-sm font-semibold text-content">{editingId ? 'Edit Assessment' : 'New Assessment'}</p>

            {childList.length > 1 && (
              <div>
                <span className="block text-xs text-subtle mb-1.5">Child</span>
                <div className="flex gap-2 flex-wrap">
                  {childList.map(c => (
                    <button key={c.id} type="button" onClick={() => setForm(f => ({ ...f, child_id: c.id }))}
                      className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${form.child_id === c.id ? 'bg-green-700 text-white' : 'bg-elevated text-muted hover:bg-elevated'}`}>
                      {c.name}
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs text-subtle mb-1.5" htmlFor="date-1">Date</label>
                <input id="date-1" type="date" value={form.assessment_date}
                  onChange={e => setForm(f => ({ ...f, assessment_date: e.target.value }))}
                  className="appearance-none w-full bg-elevated border border-line-strong h-10 rounded-lg px-3 text-content text-sm focus:outline-none focus:border-green-600" />
              </div>
              <div>
                <label className="block text-xs text-subtle mb-1.5" htmlFor="type-2">Type</label>
                <select id="type-2" value={form.type} onChange={e => setForm(f => ({ ...f, type: e.target.value }))}
                  className="w-full bg-elevated border border-line-strong h-10 rounded-lg px-3 text-content text-sm focus:outline-none focus:border-green-600">
                  {ASSESSMENT_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                </select>
              </div>
            </div>

            <div>
              <label className="block text-xs text-subtle mb-1.5" htmlFor="title-name-3">Title / Name</label>
              <input id="title-name-3" type="text" value={form.title}
                onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
                placeholder="e.g. Iowa Test of Basic Skills, Portfolio Review with Dr. Smith"
                className="w-full bg-elevated border border-line-strong h-10 rounded-lg px-3 text-content text-sm placeholder-subtle focus:outline-none focus:border-green-600" />
            </div>

            <div>
              <label className="block text-xs text-subtle mb-1.5" htmlFor="administered-by-optional-4">Administered by (optional)</label>
              <input id="administered-by-optional-4" type="text" value={form.administered_by}
                onChange={e => setForm(f => ({ ...f, administered_by: e.target.value }))}
                placeholder="e.g. Local school district, Dr. Jane Smith"
                className="w-full bg-elevated border border-line-strong h-10 rounded-lg px-3 text-content text-sm placeholder-subtle focus:outline-none focus:border-green-600" />
            </div>

            <div>
              <label className="block text-xs text-subtle mb-1.5" htmlFor="results-optional-5">Results (optional)</label>
              <input id="results-optional-5" type="text" value={form.results}
                onChange={e => setForm(f => ({ ...f, results: e.target.value }))}
                placeholder="e.g. 85th percentile, Satisfactory, Grade level 4.5"
                className="w-full bg-elevated border border-line-strong h-10 rounded-lg px-3 text-content text-sm placeholder-subtle focus:outline-none focus:border-green-600" />
            </div>

            <div>
              <label className="block text-xs text-subtle mb-1.5" htmlFor="notes-optional-6">Notes (optional)</label>
              <textarea id="notes-optional-6" value={form.notes} rows={2}
                onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
                placeholder="Additional context, follow-up items..."
                className="w-full bg-elevated border border-line-strong rounded-lg px-3 py-2 text-content text-sm placeholder-subtle resize-none focus:outline-none focus:border-green-600" />
            </div>

            {error && <p className="text-red-600 dark:text-red-400 text-xs">{error}</p>}
            <div className="flex gap-3">
              <button onClick={handleSave} disabled={saving}
                className="bg-green-700 hover:bg-green-600 disabled:opacity-50 text-white text-sm font-semibold px-5 py-2 rounded-lg transition-colors">
                {saving ? 'Saving...' : editingId ? 'Save Changes' : 'Save Assessment'}
              </button>
              <button onClick={resetForm} className="text-subtle hover:text-content text-sm transition-colors">Cancel</button>
            </div>
          </div>
        )}

        {/* Assessment list */}
        {assessments.length > 0 ? (
          <div className="space-y-3">
            <h3 className="text-xs font-semibold text-subtle uppercase tracking-widest">History</h3>
            {assessments.map(a => (
              <div key={a.id} className="bg-card/60 border border-line rounded-xl p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-semibold text-content">{a.title}</span>
                      <span className="text-xs bg-elevated text-muted px-2 py-0.5 rounded-full">{typeLabel(a.type)}</span>
                      {childList.length > 1 && childMap[a.child_id] && (
                        <span className="text-xs text-green-600 dark:text-green-400">{childMap[a.child_id]}</span>
                      )}
                    </div>
                    <p className="text-xs text-subtle mt-1">{fmt(a.assessment_date)}{a.administered_by ? ` · ${a.administered_by}` : ''}</p>
                    {a.results && <p className="text-xs text-content mt-1">Results: {a.results}</p>}
                    {a.notes && <p className="text-xs text-subtle mt-1">{a.notes}</p>}
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <button onClick={() => startEdit(a)}
                      className="text-xs text-subtle hover:text-content px-2 py-1 rounded border border-line-strong hover:border-line-strong transition-colors">
                      Edit
                    </button>
                    <button onClick={() => handleDelete(a.id)}
                      className="text-xs text-subtle hover:text-red-600 dark:hover:text-red-400 transition-colors">
                      ✕
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : !showForm ? (
          <div className="text-center py-16">
            <div className="text-4xl mb-3">📋</div>
            <p className="text-muted font-semibold mb-1">No assessments logged yet</p>
            <p className="text-subtle text-sm mb-6 max-w-xs mx-auto">Log tests and evaluations to document compliance in states that require annual assessment.</p>
            <button onClick={() => setShowForm(true)}
              className="text-sm text-green-600 dark:text-green-400 hover:text-green-700 dark:hover:text-green-300 transition-colors">
              Log first assessment →
            </button>
          </div>
        ) : null}
      </main>
    </div>
  )
}
