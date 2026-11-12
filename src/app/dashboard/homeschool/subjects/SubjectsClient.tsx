'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import type { Child, Subject, SchoolYear } from '@/lib/types'

const SUBJECT_SUGGESTIONS = [
  'Math', 'Reading', 'Writing', 'Science', 'History / Social Studies',
  'Art', 'Music', 'PE / Movement', 'Life Skills', 'Bible / Character',
  'Nature Study', 'Foreign Language', 'Homestead / Ag', 'Cooking / Nutrition',
  'Building / STEM', 'Typing / Computer', 'Logic / Critical Thinking',
]

const SUBJECT_COLORS = [
  { label: 'Green', value: 'green', cls: 'bg-green-700' },
  { label: 'Blue', value: 'blue', cls: 'bg-blue-700' },
  { label: 'Amber', value: 'amber', cls: 'bg-amber-600' },
  { label: 'Red', value: 'red', cls: 'bg-red-700' },
  { label: 'Purple', value: 'purple', cls: 'bg-purple-700' },
  { label: 'Pink', value: 'pink', cls: 'bg-pink-700' },
  { label: 'Teal', value: 'teal', cls: 'bg-teal-700' },
  { label: 'Stone', value: 'stone', cls: 'bg-stone-600' },
]

const colorBadge: Record<string, string> = {
  green: 'bg-green-900 text-green-300',
  blue: 'bg-blue-900 text-blue-300',
  amber: 'bg-amber-900 text-amber-300',
  red: 'bg-red-900 text-red-300',
  purple: 'bg-purple-900 text-purple-300',
  pink: 'bg-pink-900 text-pink-300',
  teal: 'bg-teal-900 text-teal-300',
  stone: 'bg-line-strong text-content',
}

export default function SubjectsClient({
  childList,
  subjects: initialSubjects,
  activeYears,
}: {
  childList: Child[]
  subjects: Subject[]
  activeYears: SchoolYear[]
}) {
  const router = useRouter()
  const supabase = createClient()

  const [selectedChild, setSelectedChild] = useState(childList[0]?.id ?? '')
  const [subjects, setSubjects] = useState(initialSubjects)
  const [showAdd, setShowAdd] = useState(false)
  const [name, setName] = useState('')
  const [color, setColor] = useState('green')
  const [description, setDescription] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const activeYear = activeYears.find(y => y.child_id === selectedChild)
  const childSubjects = subjects.filter(s => s.child_id === selectedChild)

  async function addSubject() {
    if (!name.trim()) return
    setSaving(true)
    setError('')

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { router.push('/login'); return }

    const { data, error: err } = await supabase
      .from('subjects')
      .insert({
        user_id: user.id,
        child_id: selectedChild,
        school_year_id: activeYear?.id ?? null,
        name: name.trim(),
        color,
        description: description.trim() || null,
        is_active: true,
      })
      .select()
      .single()

    if (err) { setError(err.message); setSaving(false); return }
    setSubjects(prev => [...prev, data as Subject])
    setName('')
    setDescription('')
    setColor('green')
    setShowAdd(false)
    setSaving(false)
  }

  async function toggleActive(subject: Subject) {
    const { error: err } = await supabase
      .from('subjects')
      .update({ is_active: !subject.is_active })
      .eq('id', subject.id)

    if (!err) {
      setSubjects(prev => prev.map(s => s.id === subject.id ? { ...s, is_active: !s.is_active } : s))
    }
  }

  async function deleteSubject(id: string) {
    const { error: err } = await supabase.from('subjects').delete().eq('id', id)
    if (!err) setSubjects(prev => prev.filter(s => s.id !== id))
  }

  return (
    <div className="min-h-screen bg-surface text-content">
      <nav className="border-b border-line/60 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link href="/dashboard/homeschool" className="text-subtle hover:text-content text-sm transition-colors">← Homeschool</Link>
          <span className="text-subtle">/</span>
          <span className="text-sm font-semibold text-green-600 dark:text-green-400">Subjects</span>
        </div>
        {activeYear && (
          <span className="text-subtle text-xs">{activeYear.name}</span>
        )}
      </nav>

      <main className="max-w-2xl mx-auto px-6 py-8">
        {/* Child selector */}
        {childList.length > 1 && (
          <div className="flex gap-2 mb-6">
            {childList.map(c => (
              <button
                key={c.id}
                onClick={() => setSelectedChild(c.id)}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                  selectedChild === c.id
                    ? 'bg-green-700 text-white'
                    : 'bg-elevated text-content hover:bg-elevated'
                }`}
              >
                {c.name}
              </button>
            ))}
          </div>
        )}

        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-bold">{childList.find(c => c.id === selectedChild)?.name}&apos;s Subjects</h2>
          <button
            onClick={() => setShowAdd(true)}
            className="bg-green-700 hover:bg-green-600 text-white text-sm font-semibold px-4 py-2 rounded-lg transition-colors"
          >
            + Add Subject
          </button>
        </div>

        {/* Add form */}
        {showAdd && (
          <div className="bg-card border border-line-strong rounded-xl p-5 mb-6">
            <h3 className="font-semibold mb-4">New Subject</h3>

            {/* Suggestions */}
            <div className="mb-4">
              <p className="text-xs text-muted mb-2">Quick add:</p>
              <div className="flex flex-wrap gap-1.5">
                {SUBJECT_SUGGESTIONS.filter(s => !childSubjects.find(cs => cs.name === s)).map(s => (
                  <button
                    key={s}
                    onClick={() => setName(s)}
                    className={`px-2.5 py-1 rounded-full text-xs transition-colors ${
                      name === s ? 'bg-green-700 text-white' : 'bg-elevated text-content hover:bg-elevated'
                    }`}
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-3">
              <input
                type="text"
                value={name}
                onChange={e => setName(e.target.value)}
                placeholder="Subject name"
                className="w-full bg-elevated border border-line-strong h-10 rounded-lg px-4 py-2.5 text-content placeholder-subtle focus:outline-none focus:border-green-600"
              />
              <input
                type="text"
                value={description}
                onChange={e => setDescription(e.target.value)}
                placeholder="Description (optional)"
                className="w-full bg-elevated border border-line-strong h-10 rounded-lg px-4 py-2.5 text-content placeholder-subtle focus:outline-none focus:border-green-600"
              />
              <div>
                <p className="text-xs text-muted mb-2">Color:</p>
                <div className="flex gap-2">
                  {SUBJECT_COLORS.map(c => (
                    <button
                      key={c.value}
                      onClick={() => setColor(c.value)}
                      className={`w-7 h-7 rounded-full ${c.cls} ${color === c.value ? 'ring-2 ring-white ring-offset-2 ring-offset-card' : ''}`}
                      title={c.label}
                    />
                  ))}
                </div>
              </div>
            </div>

            {error && <p className="text-red-600 dark:text-red-400 text-sm mt-3">{error}</p>}

            <div className="flex gap-3 mt-4">
              <button
                onClick={addSubject}
                disabled={saving || !name.trim()}
                className="bg-green-700 hover:bg-green-600 disabled:opacity-50 text-white font-semibold px-5 py-2 rounded-lg text-sm transition-colors"
              >
                {saving ? 'Saving...' : 'Add'}
              </button>
              <button
                onClick={() => { setShowAdd(false); setName(''); setDescription(''); setError('') }}
                className="text-muted hover:text-content text-sm transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        {/* Subject list */}
        {childSubjects.length === 0 ? (
          <div className="text-center py-16 text-subtle">
            <div className="text-4xl mb-3">📚</div>
            <p className="text-sm">No subjects yet. Add some to get started.</p>
          </div>
        ) : (
          <div className="space-y-2">
            {childSubjects.map(subject => (
              <div
                key={subject.id}
                className={`bg-card border rounded-lg px-4 py-3 flex items-center justify-between ${
                  subject.is_active ? 'border-line' : 'border-line opacity-50'
                }`}
              >
                <div className="flex items-center gap-3">
                  {subject.color && (
                    <div className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${colorBadge[subject.color]?.split(' ')[0] ?? 'bg-stone-600'}`} />
                  )}
                  <div>
                    <div className="font-medium text-sm">{subject.name}</div>
                    {subject.description && (
                      <div className="text-xs text-subtle">{subject.description}</div>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <button
                    onClick={() => toggleActive(subject)}
                    className="text-xs text-subtle hover:text-content transition-colors"
                  >
                    {subject.is_active ? 'Archive' : 'Restore'}
                  </button>
                  <button
                    onClick={() => deleteSubject(subject.id)}
                    className="text-xs text-red-500 hover:text-red-400 transition-colors"
                  >
                    Delete
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  )
}
