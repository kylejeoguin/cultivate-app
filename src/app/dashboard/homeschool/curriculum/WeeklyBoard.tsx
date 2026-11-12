'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { useToday, todayLocalISO } from '@/lib/use-today'
import type { Subject, PlannerWeek, PlannerItem } from '@/lib/types'

// v1 grid is Mon–Fri. The Loop zone absorbs weekend/flexible work; Sat/Sun columns
// can be added later. Research: "sequence not schedule, blank is fine."
const DAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri']
const DAY_COUNT = DAY_LABELS.length

const subjectDot: Record<string, string> = {
  green: 'bg-green-600', blue: 'bg-blue-600', amber: 'bg-amber-500', red: 'bg-red-600',
  purple: 'bg-purple-600', pink: 'bg-pink-600', teal: 'bg-teal-600', stone: 'bg-stone-500',
}

function parseLocal(iso: string): Date { return new Date(iso + 'T12:00:00') }
function isoMonday(iso: string): string {
  const d = parseLocal(iso)
  const dow = (d.getDay() + 6) % 7 // 0 = Monday
  d.setDate(d.getDate() - dow)
  return todayLocalISO(d)
}
function addDaysISO(iso: string, n: number): string {
  const d = parseLocal(iso)
  d.setDate(d.getDate() + n)
  return todayLocalISO(d)
}
function fmtMonthDay(iso: string): string {
  return parseLocal(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}
function firstOfMonthISO(iso: string): string {
  const d = parseLocal(iso); d.setDate(1); return todayLocalISO(d)
}
function addMonthsISO(iso: string, n: number): string {
  const d = parseLocal(iso); d.setMonth(d.getMonth() + n); return todayLocalISO(d)
}
function monthIndex(iso: string): number { return parseLocal(iso).getMonth() }
function monthLabel(iso: string): string {
  return parseLocal(iso).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
}

export default function WeeklyBoard({
  selectedChild, selectedYearId, subjects, onSubjectCreated,
  initialWeeks, initialItems,
}: {
  selectedChild: string
  selectedYearId: string
  subjects: Subject[]
  onSubjectCreated: (s: Subject) => void
  initialWeeks: PlannerWeek[]
  initialItems: PlannerItem[]
}) {
  const router = useRouter()
  const supabase = createClient()

  const [weeks, setWeeks] = useState(initialWeeks)
  const [items, setItems] = useState(initialItems)
  const [draggingId, setDraggingId] = useState<string | null>(null)
  const [showStartMenu, setShowStartMenu] = useState(false)
  const [busy, setBusy] = useState(false)
  const [view, setView] = useState<'week' | 'month'>('week')
  const [monthAnchor, setMonthAnchor] = useState(() => firstOfMonthISO(new Date().toISOString().slice(0, 10)))

  // Hydration-safe week anchor: first paint uses the UTC-derived Monday (matches
  // SSR), then corrects to the user's local Monday on mount. Navigation pins it.
  const [weekStart, setWeekStart] = useState(() => isoMonday(new Date().toISOString().slice(0, 10)))
  const [pinned, setPinned] = useState(false)
  useEffect(() => { if (!pinned) setWeekStart(isoMonday(todayLocalISO())) }, [pinned])

  // Hydration-safe "today": SSR (Vercel = UTC) would otherwise pin the highlight to
  // the UTC date, which is tomorrow for US-evening users. useToday() corrects to the
  // device's local date on mount, forcing a re-render so the right day highlights.
  const [todayISO] = useToday()

  const yearKey = selectedYearId || null
  const currentWeek = weeks.find(w =>
    !w.is_template && w.child_id === selectedChild &&
    w.school_year_id === yearKey && w.week_start === weekStart
  )
  const weekItems = currentWeek ? items.filter(i => i.week_id === currentWeek.id) : []
  const dailyItems = weekItems.filter(i => i.track === 'daily').sort((a, b) => a.sequence - b.sequence)
  const loopItems = weekItems.filter(i => i.track === 'loop').sort((a, b) => a.sequence - b.sequence)
  const dayItems = (d: number) =>
    weekItems.filter(i => i.track === 'day' && i.day_of_week === d).sort((a, b) => a.sequence - b.sequence)

  const isThisWeek = weekStart === isoMonday(todayISO)
  const todayDay = isThisWeek ? (parseLocal(todayISO).getDay() + 6) % 7 : -1

  // Loop "Mark done" drop target + a label that matches where the block actually lands:
  // an in-grid weekday → that day ("today"); a weekend (todayDay 5–6, off the Mon–Fri grid)
  // → Friday; a non-current week → Monday. Keeps the Loop hint honest (it used to say
  // "today" on weekends while the block really dropped on Friday).
  const loopInGridToday = isThisWeek && todayDay >= 0 && todayDay <= DAY_COUNT - 1
  const loopTargetDay = loopInGridToday ? todayDay : isThisWeek ? DAY_COUNT - 1 : 0
  const loopTargetLabel = loopInGridToday ? 'today' : isThisWeek ? 'Friday' : 'Monday'

  function goWeek(delta: number) { setPinned(true); setWeekStart(addDaysISO(weekStart, delta * 7)) }
  function goThisWeek() { setPinned(true); setWeekStart(isoMonday(todayLocalISO())) }
  function goMonth(delta: number) { setMonthAnchor(addMonthsISO(monthAnchor, delta)) }
  function openWeekFromMonth(monday: string) { setPinned(true); setWeekStart(monday); setView('week') }

  // --- Subjects: pick existing or create inline (deduped, mirrors the log form) ---
  async function createSubject(name: string): Promise<Subject | null> {
    const clean = name.trim()
    if (!clean) return null
    // Case-insensitive match against the child's loaded subjects — never twin.
    const local = subjects.find(s => s.name.trim().toLowerCase() === clean.toLowerCase())
    if (local) return local
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { router.push('/login'); return null }
    // Active-only props can miss an archived match — look it up and reactivate
    // instead of spawning a duplicate (same fix as the universal log form).
    const { data: found } = await supabase
      .from('subjects').select('*')
      .eq('child_id', selectedChild).ilike('name', clean).limit(1).maybeSingle()
    if (found) {
      const s = found as Subject
      if (!s.is_active) await supabase.from('subjects').update({ is_active: true }).eq('id', s.id)
      const live = { ...s, is_active: true }
      onSubjectCreated(live)
      return live
    }
    const { data, error } = await supabase.from('subjects').insert({
      user_id: user.id, child_id: selectedChild, name: clean,
      school_year_id: yearKey, is_active: true,
    }).select('*').single()
    if (error || !data) return null
    onSubjectCreated(data as Subject)
    return data as Subject
  }

  async function ensureWeek(targetStart: string): Promise<string | null> {
    const existing = weeks.find(w =>
      !w.is_template && w.child_id === selectedChild &&
      w.school_year_id === yearKey && w.week_start === targetStart
    )
    if (existing) return existing.id
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { router.push('/login'); return null }
    const { data, error } = await supabase.from('planner_weeks').insert({
      user_id: user.id, child_id: selectedChild, school_year_id: yearKey,
      week_start: targetStart, is_template: false, loop_position: 0,
    }).select().single()
    if (error || !data) return null
    setWeeks(prev => [...prev, data as PlannerWeek])
    return (data as PlannerWeek).id
  }

  async function insertItem(fields: Partial<PlannerItem>) {
    const weekId = await ensureWeek(weekStart)
    if (!weekId) return
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    const { data, error } = await supabase.from('planner_items').insert({
      user_id: user.id, week_id: weekId, title: fields.title, track: fields.track ?? 'day',
      day_of_week: fields.day_of_week ?? null, subject_id: fields.subject_id ?? null,
      daily_days: fields.daily_days ?? null, daily_done: fields.daily_done ?? null,
      daily_desc: fields.daily_desc ?? null, notes: fields.notes ?? null,
      status: 'todo', sequence: fields.sequence ?? 0,
    }).select().single()
    if (!error && data) setItems(prev => [...prev, data as PlannerItem])
  }

  // New daily basics default to every weekday scheduled; user unchecks days that don't apply.
  const ALL_WEEKDAYS: Record<string, boolean> = { 0: true, 1: true, 2: true, 3: true, 4: true }
  const addDayItem = (day: number, subjectId: string | null, label: string) =>
    insertItem({ track: 'day', day_of_week: day, subject_id: subjectId, title: label, notes: '', sequence: dayItems(day).length })
  const addDailyItem = (subjectId: string | null, label: string) =>
    insertItem({ track: 'daily', subject_id: subjectId, title: label, daily_days: { ...ALL_WEEKDAYS }, daily_done: {}, daily_desc: {}, sequence: dailyItems.length })
  const addLoopItem = (subjectId: string | null, label: string) =>
    insertItem({ track: 'loop', subject_id: subjectId, title: label, notes: '', sequence: loopItems.length })

  async function patchItem(id: string, patch: Partial<PlannerItem>) {
    setItems(prev => prev.map(i => i.id === id ? { ...i, ...patch } : i))
    await supabase.from('planner_items')
      .update({ ...patch, updated_at: new Date().toISOString() }).eq('id', id)
  }

  const toggleDay = (item: PlannerItem) =>
    patchItem(item.id, { status: item.status === 'done' ? 'todo' : 'done' })
  // Top section: which days a daily basic is SCHEDULED.
  const toggleDailyScheduled = (item: PlannerItem, d: number) => {
    const sched = { ...(item.daily_days ?? ALL_WEEKDAYS) }
    sched[d] = !sched[d]
    patchItem(item.id, { daily_days: sched })
  }
  // Day column: whether a scheduled daily basic was DONE that day.
  const toggleDailyDone = (item: PlannerItem, d: number) => {
    const dd = { ...(item.daily_done ?? {}) }
    dd[d] = !dd[d]
    patchItem(item.id, { daily_done: dd })
  }
  // Day column: the per-weekday lesson note on a daily basic.
  const setDailyDesc = (item: PlannerItem, d: number, text: string) => {
    const cur = item.daily_desc ?? {}
    if ((cur[d] ?? '') === text) return
    patchItem(item.id, { daily_desc: { ...cur, [d]: text } })
  }
  const moveLoopItem = (item: PlannerItem, dir: number) => {
    const idx = loopItems.findIndex(i => i.id === item.id)
    const j = idx + dir
    if (idx < 0 || j < 0 || j >= loopItems.length) return
    const a = loopItems[idx], b = loopItems[j]
    patchItem(a.id, { sequence: b.sequence })
    patchItem(b.id, { sequence: a.sequence })
  }
  const moveDayItem = (id: string, newDay: number) => {
    const it = items.find(i => i.id === id)
    if (!it || it.track !== 'day' || it.day_of_week === newDay) return
    if (newDay < 0 || newDay >= DAY_COUNT) return
    patchItem(id, { day_of_week: newDay, sequence: dayItems(newDay).length })
  }

  async function bumpToNextWeek(item: PlannerItem) {
    const nextStart = addDaysISO(weekStart, 7)
    const nextId = await ensureWeek(nextStart)
    if (!nextId) return
    setItems(prev => prev.map(i => i.id === item.id
      ? { ...i, week_id: nextId, status: 'todo' } : i))
    await supabase.from('planner_items')
      .update({ week_id: nextId, status: 'todo', updated_at: new Date().toISOString() })
      .eq('id', item.id)
  }

  async function deleteItem(id: string) {
    setItems(prev => prev.filter(i => i.id !== id))
    await supabase.from('planner_items').delete().eq('id', id)
  }

  // --- Loop = a pool of rotating subjects done in ANY order. "Mark done" on a row
  // drops that subject onto the day you did it (today this week; else Monday) as a
  // CHECKED day block, and marks the loop row done for this rotation. No pointer.
  async function completeLoopItem(item: PlannerItem) {
    if (busy) return
    setBusy(true)
    const targetDay = loopTargetDay
    const weekId = await ensureWeek(weekStart)
    if (!weekId) { setBusy(false); return }
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setBusy(false); router.push('/login'); return }
    const { data, error } = await supabase.from('planner_items').insert({
      user_id: user.id, week_id: weekId, track: 'day', day_of_week: targetDay,
      subject_id: item.subject_id, title: item.title, notes: item.notes ?? '',
      status: 'done', daily_days: null, daily_done: null, daily_desc: null,
      sequence: dayItems(targetDay).length,
    }).select().single()
    if (!error && data) setItems(prev => [...prev, data as PlannerItem])
    await patchItem(item.id, { status: 'done' })
    setBusy(false)
  }

  // Reset all loop rows to undone for the next rotation (doesn't touch the day
  // blocks already dropped — those are real work that happened).
  async function resetLoop() {
    const ids = loopItems.filter(i => i.status === 'done').map(i => i.id)
    if (ids.length === 0) return
    setItems(prev => prev.map(i => ids.includes(i.id) ? { ...i, status: 'todo' } : i))
    await supabase.from('planner_items')
      .update({ status: 'todo', updated_at: new Date().toISOString() }).in('id', ids)
  }

  // --- Phase 3: plan → daily record (deliberate per-day button, dedupe via logged_dates) ---
  const isDayLogged = (dayIndex: number) => !!currentWeek?.logged_dates?.[addDaysISO(weekStart, dayIndex)]
  async function logDayToRecord(dayIndex: number) {
    if (busy) return
    const date = addDaysISO(weekStart, dayIndex)
    setBusy(true)
    const weekId = await ensureWeek(weekStart)
    if (!weekId) { setBusy(false); return }
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setBusy(false); router.push('/login'); return }
    const wk = weeks.find(w => w.id === weekId)
    const doneDaily = dailyItems
      .filter(it => (it.daily_days ? it.daily_days[dayIndex] : true) && it.daily_done?.[dayIndex])
    const doneDay = dayItems(dayIndex).filter(i => i.status === 'done')
    // Build a readable note ("Subject — lesson"), and collect subjects for credit.
    const lineFor = (it: PlannerItem, desc: string | null | undefined) =>
      desc && desc.trim() ? `${it.title} — ${desc.trim()}` : it.title
    const titles = [
      ...doneDaily.map(it => lineFor(it, it.daily_desc?.[dayIndex])),
      ...doneDay.map(it => lineFor(it, it.notes)),
    ]
    const subjectIds = [...new Set(
      [...doneDaily, ...doneDay].map(it => it.subject_id).filter(Boolean) as string[]
    )]
    const notes = titles.length ? `Planner: ${titles.join(', ')}` : 'School day (from planner)'
    const existingId = wk?.logged_dates?.[date]
    if (existingId) {
      await supabase.from('daily_log')
        .update({ notes, subject_ids: subjectIds, updated_at: new Date().toISOString() })
        .eq('id', existingId)
    } else {
      const { data, error } = await supabase.from('daily_log').insert({
        user_id: user.id, child_id: selectedChild, school_year_id: yearKey,
        log_date: date, notes, hours: null, subject_ids: subjectIds, subject_hours: {}, is_homestead_day: false,
      }).select('id').single()
      if (!error && data) {
        const map = { ...(wk?.logged_dates ?? {}), [date]: (data as { id: string }).id }
        setWeeks(prev => prev.map(w => w.id === weekId ? { ...w, logged_dates: map } : w))
        await supabase.from('planner_weeks')
          .update({ logged_dates: map, updated_at: new Date().toISOString() }).eq('id', weekId)
      }
    }
    setBusy(false)
  }

  // --- Templates / Start-New-Week / carry-forward ---
  const templates = weeks.filter(w => w.is_template && w.child_id === selectedChild)
  const lastWeek = weeks
    .filter(w => !w.is_template && w.child_id === selectedChild && w.school_year_id === yearKey && w.week_start && w.week_start < weekStart)
    .sort((a, b) => (b.week_start ?? '').localeCompare(a.week_start ?? ''))[0] ?? null

  // Clone carries the SUBJECT SCHEDULE and BLANKS the descriptions (v3 decision 2):
  // daily basics carry subject + which-days (desc + done reset); loop entries carry
  // subject + "what's next" pointer. Day one-offs are week-specific — not cloned
  // (carry-forward moves genuinely-unfinished day items separately).
  async function cloneItemsInto(targetWeekId: string, src: PlannerItem[], userId: string): Promise<PlannerItem[]> {
    const recurring = src.filter(it => it.track !== 'day')
    if (recurring.length === 0) return []
    const rows = recurring.map(it => ({
      user_id: userId, week_id: targetWeekId, track: it.track,
      day_of_week: null, subject_id: it.subject_id,
      title: it.title, status: 'todo' as const,
      daily_days: it.track === 'daily' ? (it.daily_days ?? { ...ALL_WEEKDAYS }) : null,
      daily_done: it.track === 'daily' ? {} : null,
      daily_desc: it.track === 'daily' ? {} : null,
      notes: it.track === 'loop' ? (it.notes ?? '') : null,
      sequence: it.sequence,
    }))
    const { data } = await supabase.from('planner_items').insert(rows).select()
    return (data ?? []) as PlannerItem[]
  }

  async function saveAsTemplate() {
    if (!currentWeek || weekItems.length === 0 || busy) return
    const name = window.prompt('Name this template (e.g. "Typical week")')?.trim()
    if (!name) return
    setBusy(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setBusy(false); router.push('/login'); return }
    const { data: tpl } = await supabase.from('planner_weeks').insert({
      user_id: user.id, child_id: selectedChild, school_year_id: yearKey,
      week_start: null, is_template: true, template_name: name, loop_position: 0,
    }).select().single()
    if (tpl) {
      const cloned = await cloneItemsInto((tpl as PlannerWeek).id, weekItems, user.id)
      setWeeks(prev => [...prev, tpl as PlannerWeek])
      setItems(prev => [...prev, ...cloned])
    }
    setBusy(false)
  }

  async function deleteTemplate(id: string) {
    setWeeks(prev => prev.filter(w => w.id !== id))
    setItems(prev => prev.filter(i => i.week_id !== id))
    await supabase.from('planner_weeks').delete().eq('id', id)
  }

  async function startWeekFrom(sourceWeekId: string | null, carryForward: boolean) {
    if (busy) return
    setShowStartMenu(false)
    setBusy(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setBusy(false); router.push('/login'); return }
    const targetId = await ensureWeek(weekStart)
    if (!targetId) { setBusy(false); return }

    // Replace, don't stack: clear the target week's existing recurring structure
    // (daily + loop) first, so re-picking a different template swaps it in instead
    // of adding to it. One-off day blocks (manual entries, carry-forward) are kept.
    const existingRecurring = items.filter(i => i.week_id === targetId && (i.track === 'daily' || i.track === 'loop'))
    if (existingRecurring.length > 0) {
      const rmIds = existingRecurring.map(i => i.id)
      setItems(prev => prev.filter(i => !rmIds.includes(i.id)))
      await supabase.from('planner_items').delete().in('id', rmIds)
    }
    // The loop list is being replaced — reset the rotation pointer.
    setWeeks(prev => prev.map(w => w.id === targetId ? { ...w, loop_position: 0 } : w))
    await supabase.from('planner_weeks')
      .update({ loop_position: 0, updated_at: new Date().toISOString() }).eq('id', targetId)

    // recurring structure from a template or last week (status + descriptions reset)
    if (sourceWeekId) {
      const added = await cloneItemsInto(targetId, items.filter(i => i.week_id === sourceWeekId), user.id)
      if (added.length > 0) setItems(prev => [...prev, ...added])
    }

    // carry forward unfinished day-items from the immediately-prior real week (MOVE)
    if (carryForward && lastWeek) {
      const undone = items.filter(i => i.week_id === lastWeek.id && i.track === 'day' && i.status === 'todo')
      if (undone.length > 0) {
        const ids = undone.map(i => i.id)
        setItems(prev => prev.map(i => ids.includes(i.id) ? { ...i, week_id: targetId } : i))
        await supabase.from('planner_items')
          .update({ week_id: targetId, updated_at: new Date().toISOString() }).in('id', ids)
      }
    }
    setBusy(false)
  }

  const subjectOf = (id: string | null) => id ? subjects.find(s => s.id === id) ?? null : null

  return (
    <section className="mb-8">
      <div className="flex justify-end mb-3">
        <div className="inline-flex rounded-lg bg-elevated p-0.5 text-xs">
          <button onClick={() => setView('week')}
            className={`px-3 py-1 rounded-md transition-colors ${view === 'week' ? 'bg-green-700 text-white' : 'text-muted hover:text-content'}`}>Week</button>
          <button onClick={() => setView('month')}
            className={`px-3 py-1 rounded-md transition-colors ${view === 'month' ? 'bg-green-700 text-white' : 'text-muted hover:text-content'}`}>Month</button>
        </div>
      </div>

      {view === 'month' ? (
        <MonthView
          monthAnchor={monthAnchor}
          weeks={weeks}
          items={items}
          selectedChild={selectedChild}
          yearKey={yearKey}
          todayISO={todayISO}
          onPrev={() => goMonth(-1)}
          onNext={() => goMonth(1)}
          onOpenWeek={openWeekFromMonth}
        />
      ) : (
      <>
      {/* Week switcher */}
      <div className="relative flex items-center justify-between gap-3 mb-4 flex-wrap">
        <div className="flex items-center gap-1.5">
          <button onClick={() => goWeek(-1)} aria-label="Previous week"
            className="w-8 h-8 rounded-lg bg-elevated text-muted hover:text-content transition-colors">‹</button>
          <div className="px-2 text-center">
            <div className="font-semibold text-sm">Week of {fmtMonthDay(weekStart)}</div>
            <div className="text-[11px] text-subtle">{fmtMonthDay(weekStart)} – {fmtMonthDay(addDaysISO(weekStart, DAY_COUNT - 1))}</div>
          </div>
          <button onClick={() => goWeek(1)} aria-label="Next week"
            className="w-8 h-8 rounded-lg bg-elevated text-muted hover:text-content transition-colors">›</button>
          {!isThisWeek && (
            <button onClick={goThisWeek}
              className="ml-1 text-xs text-green-600 dark:text-green-400 hover:underline">This week</button>
          )}
          {isThisWeek && (
            <span className="ml-1 text-[11px] px-2 py-0.5 rounded-full bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300">This week</span>
          )}
        </div>

        <div className="flex items-center gap-2">
          <button onClick={saveAsTemplate} disabled={!currentWeek || weekItems.length === 0 || busy}
            className="text-xs px-3 py-1.5 rounded-lg bg-elevated text-muted hover:text-content disabled:opacity-40 transition-colors">
            Save as template
          </button>
          <div>
            <button onClick={() => setShowStartMenu(v => !v)} disabled={busy}
              className="text-xs px-3 py-1.5 rounded-lg bg-green-700 hover:bg-green-600 disabled:opacity-40 text-white font-medium transition-colors">
              {busy ? 'Working…' : 'Start week ▾'}
            </button>
            {showStartMenu && (
              <StartMenu
                weekLabel={fmtMonthDay(weekStart)}
                lastWeek={lastWeek}
                templates={templates}
                hasItems={weekItems.length > 0}
                onClose={() => setShowStartMenu(false)}
                onDeleteTemplate={deleteTemplate}
                onStart={startWeekFrom}
              />
            )}
          </div>
        </div>
      </div>

      {/* Daily basics — a subject, on which days it's scheduled; it then shows in those days */}
      <ZoneCard title="Daily basics" hint="A subject and which days it runs — it appears in those days below to plan &amp; check off">
        {dailyItems.map(item => {
          const sched = item.daily_days ?? ALL_WEEKDAYS
          const subj = subjectOf(item.subject_id)
          return (
            <div key={item.id} className="flex items-center gap-2 py-1.5">
              <span className="text-sm flex-1 truncate flex items-center gap-1.5">
                {subj && <span className={`inline-block w-1.5 h-1.5 rounded-full shrink-0 ${subjectDot[subj.color ?? 'stone'] ?? 'bg-stone-500'}`} />}
                {item.title}
              </span>
              <div className="flex items-center gap-1">
                {DAY_LABELS.map((lbl, d) => {
                  const on = !!sched[d]
                  return (
                    <button key={d} onClick={() => toggleDailyScheduled(item, d)}
                      title={`${lbl}: ${on ? 'scheduled' : 'off'}`}
                      className={`w-6 h-6 rounded text-[10px] font-medium transition-colors ${
                        on ? 'bg-green-600 text-white' : 'bg-elevated text-subtle hover:text-content'
                      }`}>
                      {lbl[0]}
                    </button>
                  )
                })}
                <button onClick={() => deleteItem(item.id)}
                  className="text-subtle hover:text-red-500 text-sm px-1.5" title="Remove">×</button>
              </div>
            </div>
          )
        })}
        <SubjectPicker subjects={subjects} createSubject={createSubject}
          placeholder="Choose a daily subject…" onPick={addDailyItem} />
      </ZoneCard>

      {/* Loop — a pool of rotating subjects done in any order; mark one done and it drops onto today */}
      <ZoneCard title="Loop" hint={`Rotating subjects — do them in any order. Mark one done and it drops onto ${loopTargetLabel}’s plan`}>
        {loopItems.length > 0 && (
          <div className="space-y-1 mb-2">
            {loopItems.map((item, idx) => {
              const subj = subjectOf(item.subject_id)
              const done = item.status === 'done'
              return (
                <div key={item.id} className="py-1.5 px-2 rounded-lg">
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => done ? patchItem(item.id, { status: 'todo' }) : completeLoopItem(item)}
                      disabled={busy && !done}
                      className={`text-[11px] font-medium px-2 py-1 rounded-md shrink-0 transition-colors ${
                        done
                          ? 'bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300'
                          : 'bg-green-700 hover:bg-green-600 disabled:opacity-40 text-white'
                      }`}
                      title={done ? 'Undo — mark not done' : 'Mark done and drop it onto the day grid'}>
                      {done ? '✓ done' : 'Mark done'}
                    </button>
                    <span className={`text-sm flex-1 min-w-0 flex items-center gap-1.5 truncate ${done ? 'line-through text-subtle' : ''}`}>
                      {subj && <span className={`inline-block w-1.5 h-1.5 rounded-full shrink-0 ${subjectDot[subj.color ?? 'stone'] ?? 'bg-stone-500'}`} />}
                      {item.title}
                    </span>
                    <button onClick={() => moveLoopItem(item, -1)} disabled={idx === 0}
                      className="text-subtle hover:text-content disabled:opacity-30 text-xs px-0.5" title="Move up">▲</button>
                    <button onClick={() => moveLoopItem(item, 1)} disabled={idx === loopItems.length - 1}
                      className="text-subtle hover:text-content disabled:opacity-30 text-xs px-0.5" title="Move down">▼</button>
                    <button onClick={() => deleteItem(item.id)}
                      className="text-base leading-none text-subtle hover:text-red-500 px-1" title="Remove">×</button>
                  </div>
                  <div className="pl-2 mt-0.5">
                    <InlineDesc value={item.notes ?? ''} placeholder="Lesson description…"
                      onCommit={v => patchItem(item.id, { notes: v })}
                      className="w-full bg-transparent border-b border-line/40 px-1 text-xs text-muted placeholder-subtle focus:outline-none focus:border-green-600" />
                  </div>
                </div>
              )
            })}
          </div>
        )}
        {loopItems.some(i => i.status === 'done') && (
          <button onClick={resetLoop} className="text-xs text-subtle hover:text-content mb-2">↺ Reset loop for next rotation</button>
        )}
        <SubjectPicker subjects={subjects} createSubject={createSubject}
          placeholder="Choose a loop subject…" onPick={addLoopItem} />
      </ZoneCard>

      {/* Day grid — each day shows its daily basics + that day's specific items */}
      <div className="flex gap-3 overflow-x-auto pb-2">
        {DAY_LABELS.map((label, d) => (
          <DayColumn
            key={d}
            label={label}
            dateLabel={fmtMonthDay(addDaysISO(weekStart, d))}
            isToday={d === todayDay}
            dayIndex={d}
            dayItems={dayItems(d)}
            dailyItems={dailyItems}
            subjects={subjects}
            subjectOf={subjectOf}
            createSubject={createSubject}
            canLeft={d > 0}
            canRight={d < DAY_COUNT - 1}
            onAddDay={(subjectId, label) => addDayItem(d, subjectId, label)}
            onToggleDayItem={toggleDay}
            onToggleDailyDone={toggleDailyDone}
            onSetDailyDesc={setDailyDesc}
            onSetDayNotes={(id, v) => patchItem(id, { notes: v })}
            onMoveDay={(id, dir) => moveDayItem(id, d + dir)}
            onBump={bumpToNextWeek}
            onDeleteDayItem={deleteItem}
            isDragging={!!draggingId}
            onDragStart={setDraggingId}
            onDropItem={() => { if (draggingId) { moveDayItem(draggingId, d); setDraggingId(null) } }}
            onLogDay={() => logDayToRecord(d)}
            isLogged={isDayLogged(d)}
          />
        ))}
      </div>
      </>
      )}
    </section>
  )
}

function ZoneCard({ title, hint, children }: { title: string; hint: string; children: React.ReactNode }) {
  return (
    <div className="bg-card border border-line rounded-xl p-4 mb-3">
      <div className="flex items-baseline gap-2 mb-2">
        <h3 className="text-sm font-semibold">{title}</h3>
        <span className="text-[11px] text-subtle" dangerouslySetInnerHTML={{ __html: hint }} />
      </div>
      {children}
    </div>
  )
}

// Pick an existing subject, create one inline (deduped), or — when allowCustom —
// add a freeform one-off (field trip / co-op day) with no subject. onPick fires
// with (subjectId|null, label). Resets to the placeholder after each pick.
function SubjectPicker({
  subjects, createSubject, onPick, placeholder, allowCustom = false, compact = false,
}: {
  subjects: Subject[]
  createSubject: (name: string) => Promise<Subject | null>
  onPick: (subjectId: string | null, label: string) => void
  placeholder: string
  allowCustom?: boolean
  compact?: boolean
}) {
  const [mode, setMode] = useState<'idle' | 'new' | 'custom'>('idle')
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)

  async function commitNew() {
    const t = text.trim()
    if (!t || busy) return
    setBusy(true)
    const s = await createSubject(t)
    setBusy(false)
    if (s) { onPick(s.id, s.name); setText(''); setMode('idle') }
  }
  function commitCustom() {
    const t = text.trim()
    if (!t) return
    onPick(null, t); setText(''); setMode('idle')
  }

  const selCls = compact
    ? 'w-full bg-transparent border border-dashed border-line rounded-lg px-2 py-1 text-xs text-content focus:outline-none focus:border-green-600'
    : 'w-full max-w-full bg-elevated border border-line h-9 rounded-lg px-3 text-sm text-content focus:outline-none focus:border-green-600'
  const inputCls = compact
    ? 'flex-1 bg-elevated border border-line rounded-lg px-2 py-1 text-xs text-content placeholder-subtle focus:outline-none focus:border-green-600'
    : 'flex-1 bg-elevated border border-line h-9 rounded-lg px-3 text-sm text-content placeholder-subtle focus:outline-none focus:border-green-600'
  const btnCls = compact
    ? 'bg-green-700 hover:bg-green-600 disabled:opacity-40 text-white text-xs font-medium px-2 py-1 rounded-lg transition-colors shrink-0'
    : 'bg-green-700 hover:bg-green-600 disabled:opacity-40 text-white text-sm font-medium px-3 h-9 rounded-lg transition-colors shrink-0'

  if (mode === 'new' || mode === 'custom') {
    const commit = mode === 'new' ? commitNew : commitCustom
    return (
      <div className="flex gap-2 items-center">
        <input autoFocus type="text" value={text} onChange={e => setText(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') commit(); if (e.key === 'Escape') { setText(''); setMode('idle') } }}
          placeholder={mode === 'new' ? 'New subject name' : 'One-off (field trip, co-op…)'}
          className={inputCls} />
        <button onClick={commit} disabled={!text.trim() || busy} className={btnCls}>
          {busy ? '…' : 'Add'}
        </button>
        <button onClick={() => { setText(''); setMode('idle') }}
          className="text-subtle hover:text-content text-xs px-1" title="Cancel">×</button>
      </div>
    )
  }

  return (
    <select
      value=""
      onChange={e => {
        const v = e.target.value
        if (v === '__new__') setMode('new')
        else if (v === '__custom__') setMode('custom')
        else if (v) {
          const s = subjects.find(x => x.id === v)
          if (s) onPick(s.id, s.name)
        }
      }}
      className={selCls}
    >
      <option value="" disabled className="bg-card text-content">{placeholder}</option>
      {subjects.map(s => (
        <option key={s.id} value={s.id} className="bg-card text-content">{s.name}</option>
      ))}
      <option value="__new__" className="bg-card text-content">+ New subject…</option>
      {allowCustom && <option value="__custom__" className="bg-card text-content">+ One-off (no subject)…</option>}
    </select>
  )
}

// A small inline lesson note that WRAPS (auto-growing textarea) and commits on
// blur / Enter — not on every keystroke. Enter commits; Shift+Enter adds a line.
function InlineDesc({ value, placeholder, onCommit, className }: {
  value: string; placeholder: string; onCommit: (v: string) => void; className?: string
}) {
  const [val, setVal] = useState(value)
  const ref = useRef<HTMLTextAreaElement>(null)
  useEffect(() => { setVal(value) }, [value])
  // Grow the box to fit its content so long lessons wrap into view instead of
  // running off the end of the day column.
  useEffect(() => {
    const el = ref.current
    if (el) { el.style.height = 'auto'; el.style.height = `${el.scrollHeight}px` }
  }, [val])
  return (
    <textarea
      ref={ref} rows={1} value={val} onChange={e => setVal(e.target.value)}
      onBlur={() => { if (val !== value) onCommit(val) }}
      onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); (e.target as HTMLTextAreaElement).blur() } }}
      placeholder={placeholder}
      className={`${className ?? 'flex-1 min-w-0 bg-transparent border-b border-line/60 px-1 text-xs text-muted placeholder-subtle focus:outline-none focus:border-green-600'} resize-none overflow-hidden leading-snug align-top`}
    />
  )
}

function DayColumn({
  label, dateLabel, isToday, dayIndex, dayItems, dailyItems, subjects, subjectOf, createSubject, canLeft, canRight,
  onAddDay, onToggleDayItem, onToggleDailyDone, onSetDailyDesc, onSetDayNotes, onMoveDay, onBump, onDeleteDayItem,
  isDragging, onDragStart, onDropItem, onLogDay, isLogged,
}: {
  label: string
  dateLabel: string
  isToday: boolean
  dayIndex: number
  dayItems: PlannerItem[]
  dailyItems: PlannerItem[]
  subjects: Subject[]
  subjectOf: (id: string | null) => Subject | null
  createSubject: (name: string) => Promise<Subject | null>
  canLeft: boolean
  canRight: boolean
  onAddDay: (subjectId: string | null, label: string) => void
  onToggleDayItem: (item: PlannerItem) => void
  onToggleDailyDone: (item: PlannerItem, d: number) => void
  onSetDailyDesc: (item: PlannerItem, d: number, text: string) => void
  onSetDayNotes: (id: string, v: string) => void
  onMoveDay: (id: string, dir: number) => void
  onBump: (item: PlannerItem) => void
  onDeleteDayItem: (id: string) => void
  isDragging: boolean
  onDragStart: (id: string) => void
  onDropItem: () => void
  onLogDay: () => void
  isLogged: boolean
}) {
  return (
    // Drag-and-drop drop zone — no keyboard equivalent; the per-item buttons
    // (toggle done / inline edit) provide the accessible, keyboard-operable path.
    // eslint-disable-next-line jsx-a11y/no-static-element-interactions
    <div
      onDragOver={e => { if (isDragging) e.preventDefault() }}
      onDrop={onDropItem}
      className={`min-w-[170px] flex-1 rounded-xl border p-2.5 transition-colors ${
        isToday ? 'border-green-500/60 bg-green-50/40 dark:bg-green-900/10' : 'border-line bg-card'
      } ${isDragging ? 'outline-dashed outline-1 outline-line-strong' : ''}`}
    >
      <div className="flex items-baseline justify-between mb-2 px-0.5">
        <span className={`text-xs font-semibold ${isToday ? 'text-green-700 dark:text-green-300' : ''}`}>{label}</span>
        <span className="text-[10px] text-subtle">{dateLabel}</span>
      </div>

      {/* Daily basics scheduled for THIS day: subject + per-day lesson note + done */}
      {(() => {
        const scheduled = dailyItems.filter(it => it.daily_days ? it.daily_days[dayIndex] : true)
        if (scheduled.length === 0) return null
        return (
          <div className="space-y-1.5 mb-2 pb-2 border-b border-line">
            {scheduled.map(item => {
              const on = !!item.daily_done?.[dayIndex]
              const subj = subjectOf(item.subject_id)
              return (
                <div key={item.id} className="space-y-0.5">
                  <button onClick={() => onToggleDailyDone(item, dayIndex)}
                    className="w-full flex items-center gap-1.5 text-left px-1 py-0.5 rounded hover:bg-elevated transition-colors">
                    <span className={`w-3.5 h-3.5 rounded border shrink-0 flex items-center justify-center text-[9px] ${
                      on ? 'bg-green-600 border-green-600 text-white' : 'border-line-strong text-transparent'
                    }`}>✓</span>
                    <span className={`text-xs flex items-center gap-1 ${on ? 'line-through text-subtle' : 'text-muted'}`}>
                      {subj && <span className={`inline-block w-1.5 h-1.5 rounded-full shrink-0 ${subjectDot[subj.color ?? 'stone'] ?? 'bg-stone-500'}`} />}
                      {item.title}
                    </span>
                  </button>
                  <InlineDesc value={item.daily_desc?.[dayIndex] ?? ''} placeholder="+ lesson"
                    onCommit={v => onSetDailyDesc(item, dayIndex, v)}
                    className="w-full bg-transparent border-b border-line/40 px-1 ml-5 text-[11px] text-muted placeholder-subtle focus:outline-none focus:border-green-600" />
                </div>
              )
            })}
          </div>
        )
      })()}

      {/* Day-specific items */}
      <div className="space-y-1 mb-2 min-h-[8px]">
        {dayItems.map(item => {
          const subj = subjectOf(item.subject_id)
          const done = item.status === 'done'
          return (
            // Draggable item — DnD reordering has no keyboard equivalent; status
            // changes are also available via the accessible per-item buttons above.
            // eslint-disable-next-line jsx-a11y/no-static-element-interactions
            <div key={item.id}
              draggable
              onDragStart={() => onDragStart(item.id)}
              className="group rounded-lg bg-elevated px-2 py-1.5 text-sm cursor-grab active:cursor-grabbing"
            >
              <div className="flex items-start gap-1.5">
                <button onClick={() => onToggleDayItem(item)}
                  className={`mt-0.5 w-4 h-4 rounded border shrink-0 flex items-center justify-center text-[10px] transition-colors ${
                    done ? 'bg-green-600 border-green-600 text-white' : 'border-line-strong text-transparent hover:border-green-500'
                  }`} title={done ? 'Mark not done' : 'Mark done'}>✓</button>
                <span className={`flex-1 leading-snug ${done ? 'line-through text-subtle' : 'text-content'}`}>
                  {subj && <span className={`inline-block w-1.5 h-1.5 rounded-full mr-1 align-middle ${subjectDot[subj.color ?? 'stone'] ?? 'bg-stone-500'}`} />}
                  {item.title}
                </span>
              </div>
              {!done && (
                <InlineDesc value={item.notes ?? ''} placeholder="+ lesson"
                  onCommit={v => onSetDayNotes(item.id, v)}
                  className="w-full bg-transparent border-b border-line/40 px-1 ml-5 mt-0.5 text-[11px] text-muted placeholder-subtle focus:outline-none focus:border-green-600" />
              )}
              {done && item.notes && <p className="text-[11px] text-subtle ml-5 mt-0.5 line-through">{item.notes}</p>}
              {/* Always visible (not hover-gated) so the controls work on touch too */}
              <div className="flex items-center gap-1 mt-1 opacity-70 group-hover:opacity-100 transition-opacity">
                <button onClick={() => onMoveDay(item.id, -1)} disabled={!canLeft}
                  className="text-[11px] text-subtle hover:text-content disabled:opacity-30 px-1" title="Move to previous day">‹</button>
                <button onClick={() => onMoveDay(item.id, 1)} disabled={!canRight}
                  className="text-[11px] text-subtle hover:text-content disabled:opacity-30 px-1" title="Move to next day">›</button>
                <button onClick={() => onBump(item)}
                  className="text-[11px] text-subtle hover:text-content px-1" title="Bump to next week">⇥ next wk</button>
                <button onClick={() => onDeleteDayItem(item.id)}
                  className="text-base leading-none text-subtle hover:text-red-500 px-1 ml-auto" title="Remove">×</button>
              </div>
            </div>
          )
        })}
      </div>

      <SubjectPicker subjects={subjects} createSubject={createSubject}
        placeholder="+ add" onPick={onAddDay} allowCustom compact />

      <button onClick={onLogDay}
        className={`mt-1.5 w-full text-left text-[10px] px-1 transition-colors ${
          isLogged ? 'text-green-600 dark:text-green-400' : 'text-subtle hover:text-green-600 dark:hover:text-green-400'
        }`}
        title="Record this day's completed work to your daily log">
        {isLogged ? '✓ logged to record · update' : '→ log to record'}
      </button>
    </div>
  )
}

function StartMenu({
  weekLabel, lastWeek, templates, hasItems, onClose, onDeleteTemplate, onStart,
}: {
  weekLabel: string
  lastWeek: PlannerWeek | null
  templates: PlannerWeek[]
  hasItems: boolean
  onClose: () => void
  onDeleteTemplate: (id: string) => void
  onStart: (sourceId: string | null, carry: boolean) => void
}) {
  const [carry, setCarry] = useState(true)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])
  return (
    <>
      <button type="button" aria-label="Close" className="fixed inset-0 z-10" onClick={onClose} />
      <div className="absolute right-0 top-full mt-1 w-full sm:w-72 max-w-[calc(100vw-2rem)] bg-card border border-line rounded-xl shadow-xl p-3 z-20 text-left">
        <p className="text-[11px] text-subtle mb-2">Fill the week of {weekLabel} from…</p>
        {hasItems && (
          <p className="text-[11px] text-amber-600 dark:text-amber-400 mb-2">
            This week already has a plan — picking a source replaces the daily &amp; loop
            structure. Your one-off day items stay.
          </p>
        )}
        <div className="space-y-1 mb-3">
          {lastWeek && (
            <button onClick={() => onStart(lastWeek.id, carry)}
              className="w-full text-left text-sm px-3 py-2 rounded-lg bg-elevated hover:text-content text-muted transition-colors">↺ Last week</button>
          )}
          {templates.map(t => (
            <div key={t.id} className="flex items-center gap-1">
              <button onClick={() => onStart(t.id, carry)}
                className="flex-1 text-left text-sm px-3 py-2 rounded-lg bg-elevated hover:text-content text-muted transition-colors truncate">▦ {t.template_name}</button>
              <button onClick={() => onDeleteTemplate(t.id)}
                className="text-subtle hover:text-red-500 px-1.5 text-sm shrink-0" title="Delete template">×</button>
            </div>
          ))}
          <button onClick={() => onStart(null, carry)}
            className="w-full text-left text-sm px-3 py-2 rounded-lg bg-elevated hover:text-content text-muted transition-colors">＋ Blank week</button>
        </div>
        <label className="flex items-center gap-2 text-xs text-muted cursor-pointer">
          <input type="checkbox" checked={carry} onChange={e => setCarry(e.target.checked)} className="accent-green-600" />
          Carry over last week&rsquo;s unfinished items
        </label>
        <p className="text-[11px] text-subtle mt-2">Subjects &amp; which-days carry over; lesson notes start fresh each week.</p>
      </div>
    </>
  )
}

function MonthView({
  monthAnchor, weeks, items, selectedChild, yearKey, todayISO, onPrev, onNext, onOpenWeek,
}: {
  monthAnchor: string
  weeks: PlannerWeek[]
  items: PlannerItem[]
  selectedChild: string
  yearKey: string | null
  todayISO: string
  onPrev: () => void
  onNext: () => void
  onOpenWeek: (monday: string) => void
}) {
  const first = firstOfMonthISO(monthAnchor)
  const last = addDaysISO(addMonthsISO(first, 1), -1)
  const m = monthIndex(monthAnchor)
  const mondays: string[] = []
  let mon = isoMonday(first)
  while (parseLocal(mon) <= parseLocal(last)) { mondays.push(mon); mon = addDaysISO(mon, 7) }

  const weekFor = (monday: string) =>
    weeks.find(w => !w.is_template && w.child_id === selectedChild && w.school_year_id === yearKey && w.week_start === monday) ?? null
  const countFor = (week: PlannerWeek | null, d: number) => {
    if (!week) return 0
    const wi = items.filter(i => i.week_id === week.id)
    const day = wi.filter(i => i.track === 'day' && i.day_of_week === d).length
    const daily = wi.filter(i => i.track === 'daily' && (i.daily_days ? i.daily_days[d] : true)).length
    return day + daily
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <button onClick={onPrev} aria-label="Previous month"
          className="w-8 h-8 rounded-lg bg-elevated text-muted hover:text-content transition-colors">‹</button>
        <div className="font-semibold text-sm">{monthLabel(monthAnchor)}</div>
        <button onClick={onNext} aria-label="Next month"
          className="w-8 h-8 rounded-lg bg-elevated text-muted hover:text-content transition-colors">›</button>
      </div>
      <div className="grid grid-cols-5 gap-1 mb-1 text-center text-[11px] text-subtle">
        {DAY_LABELS.map(l => <div key={l}>{l}</div>)}
      </div>
      <div className="space-y-1">
        {mondays.map(monday => {
          const wk = weekFor(monday)
          return (
            <div key={monday} className="grid grid-cols-5 gap-1">
              {DAY_LABELS.map((_, d) => {
                const date = addDaysISO(monday, d)
                const inMonth = monthIndex(date) === m
                const isToday = date === todayISO
                const count = countFor(wk, d)
                return (
                  <button key={d} onClick={() => onOpenWeek(monday)}
                    className={`h-16 rounded-lg border p-1.5 text-left transition-colors ${
                      isToday ? 'border-green-500/60 bg-green-50/40 dark:bg-green-900/10'
                      : inMonth ? 'border-line bg-card hover:border-green-500/40' : 'border-line/50 bg-surface'
                    }`}>
                    <div className={`text-[11px] ${inMonth ? (isToday ? 'text-green-700 dark:text-green-300 font-semibold' : 'text-content') : 'text-subtle'}`}>
                      {parseLocal(date).getDate()}
                    </div>
                    {count > 0 && (
                      <div className="mt-1 inline-block text-[10px] px-1.5 py-0.5 rounded-full bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300">
                        {count}
                      </div>
                    )}
                  </button>
                )
              })}
            </div>
          )
        })}
      </div>
      <p className="text-[11px] text-subtle mt-3">Tap any day to open that week. The number is planned items that day.</p>
    </div>
  )
}
