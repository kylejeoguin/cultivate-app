// Recurring homestead chore scheduling — one place for the cadence math, used by the create
// form (first due date), the completion flow (next due date), and the display labels.

export type ChoreCadence =
  | { cadence_type: 'interval'; interval_days: number | null; weekday?: number | null }
  | { cadence_type: 'weekly'; weekday: number | null; interval_days?: number | null }

const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

// Parse a YYYY-MM-DD as a local noon Date (matches the rest of the app; avoids TZ off-by-one).
function parseISO(iso: string): Date {
  return new Date(iso + 'T12:00:00')
}
function toISO(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

/** First due date for a brand-new chore, given today. Interval starts today; weekly lands on the
 *  next occurrence of its weekday on-or-after today. */
export function firstDueDate(c: ChoreCadence, todayISO: string): string {
  if (c.cadence_type === 'interval') return todayISO
  const d = parseISO(todayISO)
  while (d.getDay() !== c.weekday) d.setDate(d.getDate() + 1)
  return toISO(d)
}

/** Next due date after a chore is completed on `completedISO`. Interval = completed + N days;
 *  weekly = the next occurrence of its weekday strictly after the completion date. */
export function nextDueDate(c: ChoreCadence, completedISO: string): string {
  const d = parseISO(completedISO)
  if (c.cadence_type === 'interval') {
    d.setDate(d.getDate() + (c.interval_days ?? 1))
    return toISO(d)
  }
  do { d.setDate(d.getDate() + 1) } while (d.getDay() !== c.weekday)
  return toISO(d)
}

/** Human label for a cadence, e.g. "Every 7 days" / "Weekly on Friday". */
export function describeCadence(c: ChoreCadence): string {
  if (c.cadence_type === 'interval') {
    const n = c.interval_days ?? 1
    return n === 1 ? 'Every day' : `Every ${n} days`
  }
  return `Weekly on ${WEEKDAYS[c.weekday ?? 0]}`
}

/**
 * How overdue/due a chore is, from its next_due_date vs today.
 * Sign convention: **positive = upcoming, 0 = due today, negative = overdue** — which is what
 * every caller assumes (ChoresClient groups on `days < 0` / `=== 0` / `> 0`). The comment here
 * previously said "Negative = upcoming", which is the opposite of what this returns.
 *
 * Sibling of `daysUntil` in `@/lib/dueDates` — same convention, but this one takes an explicit
 * `todayISO` (deterministic, testable) and rounds instead of ceiling. Kept separate rather than
 * merged, because unifying them would silently change chore bucketing.
 */
export function daysUntilDue(nextDueISO: string, todayISO: string): number {
  const due = parseISO(nextDueISO).getTime()
  const today = parseISO(todayISO).getTime()
  return Math.round((due - today) / 86_400_000)
}

/** Convert an estimated-minutes value to credit hours (1 decimal), for the credit prefill. */
export function minutesToHours(min: number | null | undefined): number {
  if (!min || min <= 0) return 0
  return Math.round((min / 60) * 100) / 100
}

export const WEEKDAY_OPTIONS = WEEKDAYS.map((label, value) => ({ value, label }))
