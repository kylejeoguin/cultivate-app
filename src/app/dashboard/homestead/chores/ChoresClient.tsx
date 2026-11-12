'use client'

import { useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import type { HomesteadChore, Child, Subject } from '@/lib/types'
import { todayLocalISO, useToday } from '@/lib/use-today'
import {
  firstDueDate, nextDueDate, describeCadence, daysUntilDue, minutesToHours, WEEKDAY_OPTIONS,
  type ChoreCadence,
} from '@/lib/chores'

function fmtDate(iso: string) {
  return new Date(iso + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
}
function dueLabel(days: number): string {
  if (days < 0) return `${Math.abs(days)}d overdue`
  if (days === 0) return 'Due today'
  if (days === 1) return 'Due tomorrow'
  return `in ${days}d`
}

export default function ChoresClient({ initialChores, childList, subjects }: {
  initialChores: HomesteadChore[]
  childList: Child[]
  subjects: Subject[]
}) {
  const supabase = createClient()
  const [chores, setChores] = useState(initialChores)

  // "Today" must be the USER'S calendar date, not the server's.
  //
  // This used to arrive as a `todayISO` prop computed server-side with
  // `new Date().toISOString()`. On Vercel the server runs in UTC, so after ~7pm Central that
  // string is already TOMORROW — and because the buckets below compare calendar date to
  // calendar date, every chore shifted a full day: tomorrow's read as "due today", today's
  // read as "1d overdue". The same file already used todayLocalISO() when WRITING a chore and
  // a completion, so the component recorded your local date and then bucketed by UTC — it
  // disagreed with itself, and a chore completed in the evening could immediately look overdue.
  //
  // useToday is the hydration-safe form: it renders the UTC date on the server and first paint
  // so the markup matches, then corrects to the real local date on mount.
  const [todayISO] = useToday()

  // Re-sync state when the server hands down fresh props (same pattern as the other homestead
  // clients — state seeded once from props otherwise ignores a server refresh).
  const [syncedFrom, setSyncedFrom] = useState(initialChores)
  if (syncedFrom !== initialChores) { setSyncedFrom(initialChores); setChores(initialChores) }

  const [showAdd, setShowAdd] = useState(false)
  const [completing, setCompleting] = useState<HomesteadChore | null>(null)

  const childMap: Record<string, string> = {}
  childList.forEach(c => { childMap[c.id] = c.name })

  async function getUserId() {
    const { data } = await supabase.auth.getUser()
    return data.user?.id ?? null
  }

  function cadenceOf(c: HomesteadChore): ChoreCadence {
    return c.cadence_type === 'weekly'
      ? { cadence_type: 'weekly', weekday: c.weekday }
      : { cadence_type: 'interval', interval_days: c.interval_days }
  }

  async function pauseChore(id: string) {
    await supabase.from('homestead_chores').update({ is_active: false }).eq('id', id)
    setChores(prev => prev.filter(c => c.id !== id))
  }

  // ── grouping by urgency ──
  const withDays = chores.map(c => ({ c, days: daysUntilDue(c.next_due_date, todayISO) }))
  const overdue = withDays.filter(x => x.days < 0).sort((a, b) => a.days - b.days)
  const dueToday = withDays.filter(x => x.days === 0)
  const upcoming = withDays.filter(x => x.days > 0).sort((a, b) => a.days - b.days)

  return (
    <div className="min-h-screen bg-surface text-content">
      <nav className="border-b border-line/60 px-6 py-4 flex items-center gap-3">
        <Link href="/dashboard/household" className="text-subtle hover:text-content text-sm transition-colors">← Household</Link>
        <span className="text-subtle">/</span>
        <h1 className="text-sm font-semibold text-amber-600 dark:text-amber-400">Chores &amp; Routines</h1>
      </nav>

      <main className="max-w-2xl mx-auto px-6 py-8 pb-24">
        <div className="flex items-start justify-between mb-6">
          <div>
            <h2 className="text-xl font-bold mb-1 tracking-tight">Chores &amp; Routines</h2>
            <p className="text-muted text-sm">Recurring homestead tasks — what&apos;s due, and who did it.</p>
          </div>
          {!showAdd && (
            <button onClick={() => setShowAdd(true)}
              className="bg-green-700 hover:bg-green-600 text-white text-sm font-semibold px-4 py-2 rounded-lg transition-colors shrink-0">
              + New chore
            </button>
          )}
        </div>

        {showAdd && (
          <AddChoreForm
            childList={childList}
            onCancel={() => setShowAdd(false)}
            onCreate={async (draft) => {
              const uid = await getUserId(); if (!uid) return
              const next = firstDueDate(draft.cadence, todayLocalISO())
              const row = {
                user_id: uid,
                name: draft.name,
                cadence_type: draft.cadence.cadence_type,
                interval_days: draft.cadence.cadence_type === 'interval' ? draft.cadence.interval_days : null,
                weekday: draft.cadence.cadence_type === 'weekly' ? draft.cadence.weekday : null,
                estimated_minutes: draft.estimated_minutes,
                assigned_child_id: draft.assigned_child_id,
                next_due_date: next,
              }
              const { data, error } = await supabase.from('homestead_chores').insert(row).select().single()
              if (!error && data) {
                setChores(prev => [...prev, data as HomesteadChore])
                setShowAdd(false)
              }
            }}
          />
        )}

        {chores.length === 0 && !showAdd ? (
          <div className="text-center py-14">
            <div className="w-12 h-12 rounded-2xl bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center text-2xl mx-auto mb-3">🔁</div>
            <div className="text-content font-semibold mb-1">No routines yet</div>
            <p className="text-subtle text-sm">Add the recurring things — feeding, coop cleaning, moving tractors, weeding.</p>
          </div>
        ) : (
          <div className="space-y-8 mt-6">
            <ChoreGroup title="Overdue" tone="red" items={overdue} childMap={childMap} onComplete={setCompleting} onPause={pauseChore} />
            <ChoreGroup title="Due today" tone="amber" items={dueToday} childMap={childMap} onComplete={setCompleting} onPause={pauseChore} />
            <ChoreGroup title="Upcoming" tone="subtle" items={upcoming} childMap={childMap} onComplete={setCompleting} onPause={pauseChore} />
          </div>
        )}
      </main>

      {completing && (
        <CompleteModal
          chore={completing}
          childList={childList}
          subjects={subjects}
          onClose={() => setCompleting(null)}
          onConfirm={async ({ completedDate, credit, childId, hours, subjectId }) => {
            const uid = await getUserId(); if (!uid) return
            const completion = {
              user_id: uid,
              chore_id: completing.id,
              completed_date: completedDate,
              school_credit: credit,
              child_ids: credit && childId ? [childId] : [],
              // Was hardcoded to [] — credited chore hours reached the child but carried no
              // subject, so they were invisible to subject-coverage reporting.
              subject_ids: credit && subjectId ? [subjectId] : ([] as string[]),
              credit_hours: credit ? hours : null,
            }
            const { error: cErr } = await supabase.from('chore_completions').insert(completion)
            if (cErr) return
            const next = nextDueDate(cadenceOf(completing), completedDate)
            await supabase.from('homestead_chores')
              .update({ last_completed_date: completedDate, next_due_date: next, updated_at: new Date().toISOString() })
              .eq('id', completing.id)
            setChores(prev => prev.map(c => c.id === completing.id
              ? { ...c, last_completed_date: completedDate, next_due_date: next } : c))
            setCompleting(null)
          }}
        />
      )}
    </div>
  )
}

// ── grouped list ─────────────────────────────────────────────────────────────
function ChoreGroup({ title, tone, items, childMap, onComplete, onPause }: {
  title: string; tone: 'red' | 'amber' | 'subtle'
  items: { c: HomesteadChore; days: number }[]
  childMap: Record<string, string>
  onComplete: (c: HomesteadChore) => void
  onPause: (id: string) => void
}) {
  if (items.length === 0) return null
  const toneClass = tone === 'red' ? 'text-red-600 dark:text-red-400'
    : tone === 'amber' ? 'text-amber-600 dark:text-amber-400' : 'text-subtle'
  return (
    <div>
      <h3 className={`text-xs font-semibold uppercase tracking-widest mb-3 ${toneClass}`}>{title} · {items.length}</h3>
      <div className="space-y-2">
        {items.map(({ c, days }) => (
          <div key={c.id} className="bg-card/60 border border-line rounded-xl p-4 flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-medium text-sm">{c.name}</span>
                <span className={`text-xs px-2 py-0.5 rounded-full ${days < 0 ? 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300' : days === 0 ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300' : 'bg-elevated text-subtle'}`}>
                  {dueLabel(days)}
                </span>
              </div>
              <div className="flex items-center gap-2 mt-1 flex-wrap text-xs text-subtle">
                <span>{describeCadence(c.cadence_type === 'weekly' ? { cadence_type: 'weekly', weekday: c.weekday } : { cadence_type: 'interval', interval_days: c.interval_days })}</span>
                {c.estimated_minutes != null && <span>· ~{c.estimated_minutes} min</span>}
                {c.assigned_child_id && childMap[c.assigned_child_id] && <span>· {childMap[c.assigned_child_id]}</span>}
                <span>· next {fmtDate(c.next_due_date)}</span>
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <button onClick={() => onComplete(c)}
                className="bg-green-700 hover:bg-green-600 text-white text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors">
                ✓ Done
              </button>
              <button onClick={() => onPause(c.id)} title="Archive this chore"
                className="text-xs text-subtle hover:text-content px-2 py-1.5 transition-colors">✕</button>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

// ── create form ──────────────────────────────────────────────────────────────
function AddChoreForm({ childList, onCancel, onCreate }: {
  childList: Child[]
  onCancel: () => void
  onCreate: (draft: { name: string; cadence: ChoreCadence; estimated_minutes: number | null; assigned_child_id: string | null }) => void
}) {
  const [name, setName] = useState('')
  const [mode, setMode] = useState<'interval' | 'weekly'>('interval')
  const [intervalDays, setIntervalDays] = useState('7')
  const [weekday, setWeekday] = useState('5')
  const [minutes, setMinutes] = useState('')
  const [childId, setChildId] = useState('')
  const [saving, setSaving] = useState(false)

  const valid = name.trim() && (mode === 'interval' ? parseInt(intervalDays) > 0 : true)

  async function submit() {
    if (!valid) return
    setSaving(true)
    const cadence: ChoreCadence = mode === 'interval'
      ? { cadence_type: 'interval', interval_days: parseInt(intervalDays) }
      : { cadence_type: 'weekly', weekday: parseInt(weekday) }
    await onCreate({
      name: name.trim(),
      cadence,
      estimated_minutes: minutes ? parseInt(minutes) : null,
      assigned_child_id: childId || null,
    })
    setSaving(false)
  }

  return (
    <div className="bg-card border border-line-strong rounded-xl p-5 space-y-4 mb-6">
      <div>
        <label className="block text-xs font-medium text-muted uppercase tracking-wider mb-1.5" htmlFor="chore-name">Chore</label>
        <input id="chore-name" type="text" value={name} onChange={e => setName(e.target.value)} autoFocus
          placeholder="e.g. Clean the chicken coop"
          className="w-full bg-elevated border border-line-strong rounded-lg px-3 py-2 text-content text-sm placeholder-subtle focus:outline-none focus:border-green-600" />
      </div>

      <div role="group" aria-labelledby="chore-frequency-label">
        <span id="chore-frequency-label" className="block text-xs font-medium text-muted uppercase tracking-wider mb-1.5">How often</span>
        <div className="flex gap-2 mb-2">
          <button type="button" onClick={() => setMode('interval')}
            className={`flex-1 text-sm py-2 rounded-lg border transition-colors ${mode === 'interval' ? 'bg-elevated border-green-600 text-content' : 'border-line-strong text-subtle hover:text-content'}`}>
            Every N days
          </button>
          <button type="button" onClick={() => setMode('weekly')}
            className={`flex-1 text-sm py-2 rounded-lg border transition-colors ${mode === 'weekly' ? 'bg-elevated border-green-600 text-content' : 'border-line-strong text-subtle hover:text-content'}`}>
            Weekly on a day
          </button>
        </div>
        {mode === 'interval' ? (
          <div className="flex items-center gap-2">
            <span className="text-sm text-subtle">Every</span>
            <input type="number" min="1" value={intervalDays} onChange={e => setIntervalDays(e.target.value)}
              className="w-20 bg-elevated border border-line-strong rounded-lg px-3 py-2 text-content text-sm focus:outline-none focus:border-green-600" />
            <span className="text-sm text-subtle">days</span>
          </div>
        ) : (
          <select value={weekday} onChange={e => setWeekday(e.target.value)}
            className="w-full bg-elevated border border-line-strong rounded-lg px-3 py-2 text-content text-sm focus:outline-none focus:border-green-600">
            {WEEKDAY_OPTIONS.map(w => <option key={w.value} value={w.value}>{w.label}</option>)}
          </select>
        )}
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs font-medium text-muted uppercase tracking-wider mb-1.5" htmlFor="chore-min">Time to complete <span className="normal-case text-subtle">(min, optional)</span></label>
          <input id="chore-min" type="number" min="0" value={minutes} onChange={e => setMinutes(e.target.value)} placeholder="e.g. 20"
            className="w-full bg-elevated border border-line-strong rounded-lg px-3 py-2 text-content text-sm placeholder-subtle focus:outline-none focus:border-green-600" />
        </div>
        {childList.length > 0 && (
          <div>
            <label className="block text-xs font-medium text-muted uppercase tracking-wider mb-1.5" htmlFor="chore-assignee">Usually done by <span className="normal-case text-subtle">(optional)</span></label>
            <select id="chore-assignee" value={childId} onChange={e => setChildId(e.target.value)}
              className="w-full bg-elevated border border-line-strong rounded-lg px-3 py-2 text-content text-sm focus:outline-none focus:border-green-600">
              <option value="">Anyone</option>
              {childList.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
        )}
      </div>

      <div className="flex gap-2 pt-1">
        <button onClick={submit} disabled={!valid || saving}
          className="bg-green-700 hover:bg-green-600 disabled:opacity-50 text-white text-sm font-semibold px-4 py-2 rounded-lg transition-colors">
          {saving ? 'Saving...' : 'Add chore'}
        </button>
        <button onClick={onCancel} className="text-subtle hover:text-content text-sm px-3 py-2 transition-colors">Cancel</button>
      </div>
    </div>
  )
}

// ── completion modal ─────────────────────────────────────────────────────────
function CompleteModal({ chore, childList, subjects, onClose, onConfirm }: {
  chore: HomesteadChore
  childList: Child[]
  subjects: Subject[]
  onClose: () => void
  onConfirm: (r: { completedDate: string; credit: boolean; childId: string | null; hours: number | null; subjectId: string | null }) => void
}) {
  const [completedDate, setCompletedDate] = useState(todayLocalISO())
  const [credit, setCredit] = useState(false)
  const [childId, setChildId] = useState(chore.assigned_child_id ?? '')
  const [hours, setHours] = useState(String(minutesToHours(chore.estimated_minutes) || ''))
  // Subject is REQUIRED when crediting, for the same reason the child is: this writes into a
  // record someone may hand to an evaluator, and the app's rule is that it does not guess.
  // Until now `subject_ids` was hardcoded to [], so credited chore hours landed on the child
  // with no subject at all — invisible to subject-coverage reporting, which is most of what the
  // reports are for.
  const [subjectId, setSubjectId] = useState('')
  const [saving, setSaving] = useState(false)

  const canCredit = childList.length > 0 && subjects.length > 0
  const creditValid = !credit || (childId !== '' && subjectId !== '' && hours !== '' && parseFloat(hours) >= 0)

  async function confirm() {
    if (!creditValid) return
    setSaving(true)
    await onConfirm({
      completedDate,
      credit,
      childId: credit ? childId : null,
      hours: credit ? parseFloat(hours) : null,
      subjectId: credit ? subjectId : null,
    })
    setSaving(false)
  }

  return (
    // Backdrop click-to-dismiss is a pointer convenience; keyboard users close via
    // the Cancel button below. Target check keeps clicks inside the card from closing.
    // eslint-disable-next-line jsx-a11y/no-static-element-interactions
    <div className="fixed inset-0 bg-black/50 flex items-end sm:items-center justify-center z-50 p-4"
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <div className="bg-card border border-line-strong rounded-2xl p-5 w-full max-w-md space-y-4">
        <div>
          <h3 className="text-base font-bold text-content">Mark done: {chore.name}</h3>
          <p className="text-xs text-subtle mt-0.5">Logs a completion and schedules the next one.</p>
        </div>

        <div>
          <label className="block text-xs font-medium text-muted uppercase tracking-wider mb-1.5" htmlFor="complete-date">Completed on</label>
          <input id="complete-date" type="date" value={completedDate} onChange={e => setCompletedDate(e.target.value)}
            className="w-full bg-elevated border border-line-strong rounded-lg px-3 py-2 text-content text-sm focus:outline-none focus:border-green-600" />
        </div>

        {canCredit && (
          <div className="border border-line rounded-xl p-3 space-y-3">
            <label className="flex items-center gap-2.5 cursor-pointer">
              <input type="checkbox" checked={credit} onChange={e => setCredit(e.target.checked)}
                className="w-4 h-4 accent-green-700" />
              <span className="text-sm text-content">A student did this — count it for homeschool credit</span>
            </label>

            {credit && (
              <div className="grid grid-cols-2 gap-3 pt-1">
                <div>
                  <label className="block text-xs font-medium text-muted uppercase tracking-wider mb-1.5" htmlFor="credit-child">Who did it?</label>
                  <select id="credit-child" value={childId} onChange={e => setChildId(e.target.value)}
                    className="w-full bg-elevated border border-line-strong rounded-lg px-3 py-2 text-content text-sm focus:outline-none focus:border-green-600">
                    <option value="">Pick a student…</option>
                    {childList.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-muted uppercase tracking-wider mb-1.5" htmlFor="credit-hours">Hours</label>
                  <input id="credit-hours" type="number" step="0.05" min="0" value={hours} onChange={e => setHours(e.target.value)}
                    className="w-full bg-elevated border border-line-strong rounded-lg px-3 py-2 text-content text-sm focus:outline-none focus:border-green-600" />
                </div>
              </div>
            )}
            {credit && (
              <div className="pt-1">
                <label className="block text-xs font-medium text-muted uppercase tracking-wider mb-1.5" htmlFor="credit-subject">Counts as</label>
                <select id="credit-subject" value={subjectId} onChange={e => setSubjectId(e.target.value)}
                  className="w-full bg-elevated border border-line-strong rounded-lg px-3 py-2 text-content text-sm focus:outline-none focus:border-green-600">
                  <option value="">Pick a subject…</option>
                  {subjects.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              </div>
            )}
            {credit && childId === '' && (
              <p className="text-xs text-amber-600 dark:text-amber-400">Pick which student — we won&apos;t guess who to credit.</p>
            )}
            {credit && subjectId === '' && (
              <p className="text-xs text-amber-600 dark:text-amber-400">Pick a subject — without one these hours never show up in subject coverage.</p>
            )}
            {credit && <p className="text-xs text-subtle">Prefilled from the chore&apos;s time-to-complete; adjust if it ran long or short.</p>}
          </div>
        )}

        <div className="flex gap-2 justify-end pt-1">
          <button onClick={onClose} className="text-subtle hover:text-content text-sm px-3 py-2 transition-colors">Cancel</button>
          <button onClick={confirm} disabled={saving || !creditValid}
            className="bg-green-700 hover:bg-green-600 disabled:opacity-50 text-white text-sm font-semibold px-4 py-2 rounded-lg transition-colors">
            {saving ? 'Saving...' : 'Mark done'}
          </button>
        </div>
      </div>
    </div>
  )
}
