'use client'

import { useState } from 'react'
import type { Child, Subject } from '@/lib/types'

interface DailyLog {
  id: string
  child_id: string
  log_date: string
  notes: string | null
  hours: number | null
  subject_ids: string[]
  is_homestead_day: boolean
  created_at: string
}

export function EditLogCard({
  log,
  childList,
  subjects,
  subjectMap,
  onSave,
  onDelete,
  onCancel,
}: {
  log: DailyLog
  childList: Child[]
  subjects: Subject[]
  subjectMap: Record<string, string>
  onSave: (patch: Partial<DailyLog>) => Promise<unknown>
  onDelete: () => void
  onCancel: () => void
}) {
  const [notes, setNotes] = useState(log.notes ?? '')
  const [hours, setHours] = useState(log.hours?.toString() ?? '')
  const [logDate, setLogDate] = useState(log.log_date)
  const [selectedSubjectIds, setSelectedSubjectIds] = useState<string[]>(log.subject_ids ?? [])
  const [isHomesteadDay, setIsHomesteadDay] = useState(log.is_homestead_day)
  const [saving, setSaving] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [error, setError] = useState('')

  function toggleSubject(id: string) {
    setSelectedSubjectIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id])
  }

  async function handleSave() {
    setSaving(true)
    setError('')
    const err = await onSave({
      notes: notes.trim() || null,
      hours: hours ? parseFloat(hours) : null,
      log_date: logDate,
      subject_ids: selectedSubjectIds,
      is_homestead_day: isHomesteadDay,
    })
    if (err) setError('Save failed. Please try again.')
    setSaving(false)
  }

  async function handleDelete() {
    setDeleting(true)
    onDelete()
  }

  return (
    <div className="bg-card/80 border border-green-200 dark:border-green-800/60 rounded-xl p-4 space-y-3">
      <div className="flex items-center justify-between mb-1">
        <span className="text-xs font-semibold text-green-600 dark:text-green-400 uppercase tracking-wider">Editing entry</span>
        <button onClick={onCancel} className="text-xs text-subtle hover:text-content transition-colors">← Cancel</button>
      </div>

      {/* Date */}
      <div>
        <label className="block text-xs text-subtle mb-1" htmlFor="date-1">Date</label>
        <input id="date-1"
          type="date"
          value={logDate}
          onChange={e => setLogDate(e.target.value)}
          className="appearance-none bg-elevated border border-line-strong rounded-lg px-3 py-1.5 text-content text-sm focus:outline-none focus:border-green-600"
        />
      </div>

      {/* Notes */}
      <div>
        <label className="block text-xs text-subtle mb-1" htmlFor="what-happened-2">What happened</label>
        <textarea id="what-happened-2"
          value={notes}
          onChange={e => setNotes(e.target.value)}
          rows={4}
          className="w-full bg-elevated border border-line-strong rounded-lg px-3 py-2 text-content text-sm placeholder-subtle focus:outline-none focus:border-green-600 resize-none"
          placeholder="Describe the day..."
        />
      </div>

      {/* Hours */}
      <div>
        <label className="block text-xs text-subtle mb-1" htmlFor="hours-3">Hours</label>
        <input id="hours-3"
          type="number"
          value={hours}
          onChange={e => setHours(e.target.value)}
          min="0" max="24" step="0.5"
          placeholder="e.g. 3"
          className="w-24 bg-elevated border border-line-strong rounded-lg px-3 py-1.5 text-content text-sm focus:outline-none focus:border-green-600"
        />
      </div>

      {/* Subjects */}
      {subjects.length > 0 && (
        <div>
          <span className="block text-xs text-subtle mb-1.5">Subjects</span>
          <div className="flex flex-wrap gap-1.5">
            {subjects.map(s => {
              const sel = selectedSubjectIds.includes(s.id)
              return (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => toggleSubject(s.id)}
                  className={`px-2.5 py-1 rounded-full text-xs font-medium transition-colors ${sel ? 'bg-green-700 text-white' : 'bg-elevated text-muted hover:bg-line-strong'}`}
                >
                  {s.name}
                </button>
              )
            })}
          </div>
        </div>
      )}

      {/* Homestead day toggle */}
      <label className="flex items-center gap-2 cursor-pointer">
        <input
          type="checkbox"
          checked={isHomesteadDay}
          onChange={e => setIsHomesteadDay(e.target.checked)}
          className="w-4 h-4 accent-amber-500"
        />
        <span className="text-xs text-muted">Hands-on day</span>
      </label>

      {error && <p className="text-red-600 dark:text-red-400 text-xs">{error}</p>}

      {/* Actions */}
      <div className="flex items-center justify-between pt-1 border-t border-line">
        {confirmDelete ? (
          <div className="flex items-center gap-3">
            <span className="text-xs text-subtle">Delete this entry?</span>
            <button
              onClick={handleDelete}
              disabled={deleting}
              className="text-xs text-red-600 dark:text-red-400 hover:text-red-700 dark:hover:text-red-300 font-medium transition-colors"
            >
              {deleting ? 'Deleting...' : 'Yes, delete'}
            </button>
            <button
              onClick={() => setConfirmDelete(false)}
              className="text-xs text-subtle hover:text-content transition-colors"
            >
              Cancel
            </button>
          </div>
        ) : (
          <button
            onClick={() => setConfirmDelete(true)}
            className="text-xs text-subtle hover:text-red-600 dark:hover:text-red-400 transition-colors"
          >
            Delete entry
          </button>
        )}

        <div className="flex items-center gap-3">
          <button
            onClick={onCancel}
            className="text-xs text-subtle hover:text-content transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="bg-green-700 hover:bg-green-600 disabled:opacity-50 text-white text-xs font-semibold px-4 py-1.5 rounded-lg transition-colors"
          >
            {saving ? 'Saving...' : 'Save changes'}
          </button>
        </div>
      </div>
    </div>
  )
}
