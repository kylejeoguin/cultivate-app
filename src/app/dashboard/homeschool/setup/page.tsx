'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

const LEARNING_STYLES = [
  { value: 'eclectic', label: 'Eclectic', desc: 'Mix of approaches, whatever works' },
  { value: 'charlotte_mason', label: 'Charlotte Mason', desc: 'Living books, nature study, narration' },
  { value: 'structured', label: 'Structured / Classical', desc: 'Textbooks, schedules, traditional grades' },
  { value: 'unschooling', label: 'Unschooling', desc: 'Child-led, interest-based learning' },
  { value: 'project_based', label: 'Project-Based', desc: 'Learn through real-world projects' },
]

const US_STATES = [
  'AL','AK','AZ','AR','CA','CO','CT','DE','FL','GA','HI','ID','IL','IN','IA',
  'KS','KY','LA','ME','MD','MA','MI','MN','MS','MO','MT','NE','NV','NH','NJ',
  'NM','NY','NC','ND','OH','OK','OR','PA','RI','SC','SD','TN','TX','UT','VT',
  'VA','WA','WV','WI','WY',
]

export default function SetupPage() {
  const router = useRouter()
  const supabase = createClient()

  const [childName, setChildName] = useState('')
  const [birthdate, setBirthdate] = useState('')
  const [gradeLevel, setGradeLevel] = useState('')
  const [learningStyle, setLearningStyle] = useState('eclectic')
  const [yearName, setYearName] = useState(() => {
    const now = new Date()
    const year = now.getMonth() >= 7 ? now.getFullYear() : now.getFullYear() - 1
    return `${year}-${year + 1}`
  })
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [state, setState] = useState('MO')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!childName.trim()) { setError('Child name is required.'); return }
    if (!startDate || !endDate) { setError('School year start and end dates are required.'); return }

    setSaving(true)
    setError('')

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { router.push('/login'); return }

    const { data: child, error: childErr } = await supabase
      .from('children')
      .insert({
        user_id: user.id,
        name: childName.trim(),
        birthdate: birthdate || null,
        grade_level: gradeLevel || null,
        learning_style: learningStyle,
      })
      .select()
      .single()

    if (childErr) { setError(childErr.message); setSaving(false); return }

    const { error: yearErr } = await supabase
      .from('school_years')
      .insert({
        user_id: user.id,
        child_id: child.id,
        name: yearName,
        start_date: startDate,
        end_date: endDate,
        state,
        is_active: true,
      })

    if (yearErr) { setError(yearErr.message); setSaving(false); return }

    router.push('/dashboard/homeschool')
  }

  return (
    <div className="min-h-screen bg-surface text-content flex items-start justify-center py-12 px-6">
      <div className="w-full max-w-lg">
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-green-500 mb-1">Welcome to Cultivate</h1>
          <p className="text-muted">Let&apos;s set up your first child and school year. Takes 2 minutes.</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-8">
          {/* Child info */}
          <section>
            <h2 className="text-sm font-semibold text-muted uppercase tracking-wider mb-4">About Your Child</h2>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1.5" htmlFor="name-1">Name <span className="text-green-500">*</span></label>
                <input id="name-1"
                  type="text"
                  value={childName}
                  onChange={e => setChildName(e.target.value)}
                  placeholder="e.g. Emma"
                  className="w-full bg-card border border-line-strong h-10 rounded-lg px-4 py-2.5 text-content placeholder-subtle focus:outline-none focus:border-green-600"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium mb-1.5" htmlFor="birthdate-1">Birthdate</label>
                  <input id="birthdate-1"
                    type="date"
                    value={birthdate}
                    onChange={e => setBirthdate(e.target.value)}
                    className="appearance-none w-full bg-card border border-line-strong h-10 rounded-lg px-4 py-2.5 text-content focus:outline-none focus:border-green-600"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1.5" htmlFor="grade-level-2">Grade Level</label>
                  <input id="grade-level-2"
                    type="text"
                    value={gradeLevel}
                    onChange={e => setGradeLevel(e.target.value)}
                    placeholder="e.g. 3rd grade"
                    className="w-full bg-card border border-line-strong h-10 rounded-lg px-4 py-2.5 text-content placeholder-subtle focus:outline-none focus:border-green-600"
                  />
                </div>
              </div>

              <div>
                <span className="block text-sm font-medium mb-2">Learning Style</span>
                <div className="space-y-2">
                  {LEARNING_STYLES.map(s => (
                    <label key={s.value} htmlFor={`setup-ls-${s.value}`} className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${learningStyle === s.value ? 'border-green-600 bg-green-50 dark:bg-green-950/30' : 'border-line hover:border-line-strong'}`}>
                      <input
                        id={`setup-ls-${s.value}`}
                        type="radio"
                        name="learningStyle"
                        value={s.value}
                        checked={learningStyle === s.value}
                        onChange={() => setLearningStyle(s.value)}
                        className="mt-0.5 accent-green-500"
                      />
                      <div>
                        <div className="text-sm font-medium">{s.label}</div>
                        <div className="text-xs text-muted">{s.desc}</div>
                      </div>
                    </label>
                  ))}
                </div>
              </div>
            </div>
          </section>

          {/* School year */}
          <section>
            <h2 className="text-sm font-semibold text-muted uppercase tracking-wider mb-4">School Year</h2>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1.5" htmlFor="year-name-3">Year Name</label>
                <input id="year-name-3"
                  type="text"
                  value={yearName}
                  onChange={e => setYearName(e.target.value)}
                  placeholder="e.g. 2025-2026"
                  className="w-full bg-card border border-line-strong h-10 rounded-lg px-4 py-2.5 text-content placeholder-subtle focus:outline-none focus:border-green-600"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium mb-1.5" htmlFor="start-date-2">Start Date <span className="text-green-500">*</span></label>
                  <input id="start-date-2"
                    type="date"
                    value={startDate}
                    onChange={e => setStartDate(e.target.value)}
                    className="appearance-none w-full bg-card border border-line-strong h-10 rounded-lg px-4 py-2.5 text-content focus:outline-none focus:border-green-600"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1.5" htmlFor="end-date-3">End Date <span className="text-green-500">*</span></label>
                  <input id="end-date-3"
                    type="date"
                    value={endDate}
                    onChange={e => setEndDate(e.target.value)}
                    className="appearance-none w-full bg-card border border-line-strong h-10 rounded-lg px-4 py-2.5 text-content focus:outline-none focus:border-green-600"
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium mb-1.5" htmlFor="state-4">State</label>
                <select id="state-4"
                  value={state}
                  onChange={e => setState(e.target.value)}
                  className="w-full bg-card border border-line-strong h-10 rounded-lg px-4 py-2.5 text-content focus:outline-none focus:border-green-600"
                >
                  {US_STATES.map(s => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </select>
                <p className="text-xs text-subtle mt-1.5">
                  State data is for reference only — laws change. Verify at{' '}
                  <a href="https://hslda.org/legal" target="_blank" rel="noopener noreferrer" className="underline hover:text-muted">hslda.org/legal</a>.
                </p>
              </div>
            </div>
          </section>

          {error && (
            <p className="text-red-600 dark:text-red-400 text-sm">{error}</p>
          )}

          <button
            type="submit"
            disabled={saving}
            className="w-full bg-green-700 hover:bg-green-600 disabled:opacity-50 text-white font-semibold py-3 rounded-xl transition-colors"
          >
            {saving ? 'Setting up...' : "Let's go →"}
          </button>
        </form>
      </div>
    </div>
  )
}
