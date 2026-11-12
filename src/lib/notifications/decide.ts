/**
 * THE DECISION LAYER — what (if anything) is worth telling someone today.
 *
 * This is deliberately a PURE function: no Supabase, no Resend, no cron, no clock.
 * Everything it needs arrives in the snapshot. That matters for two reasons:
 *
 *   1. It is the ~85% of this feature that survives every delivery architecture.
 *      Email today, web push, APNs when the native iOS client lands, FCM if Android
 *      follows — the adapter changes, this does not.
 *   2. Reminder bugs are invisible in production. You cannot see an email that
 *      should not have been sent. Keeping the judgement separate from the sending
 *      is what makes it inspectable at all.
 *
 * THE RULE THAT MATTERS MOST: never fire on an empty day. If nothing is due and the
 * school log is current, this returns null and NOTHING is sent. A reminder that
 * arrives when there is nothing to do is how the whole channel gets switched off,
 * and the channel is the only lever we have on retention.
 */

/** 0 = Sunday … 6 = Saturday, matching Date.prototype.getDay(). */
export type Weekday = 0 | 1 | 2 | 3 | 4 | 5 | 6

export type ItemType = 'school_log' | 'chore' | 'equipment_service'

export type DueItem =
  | {
      type: 'school_log'
      key: 'school_log'
      /** Null when the household has never logged at all. */
      lastLogDate: string | null
      daysStale: number
    }
  | {
      type: 'chore'
      key: string
      name: string
      dueDate: string
      /** 0 = due today, positive = overdue by that many days. */
      daysOverdue: number
    }
  | {
      type: 'equipment_service'
      key: string
      name: string
      equipmentName: string
      dueDate: string
      daysOverdue: number
    }

export type ReminderPrefs = {
  /** Master switch. Opt-in: false until the person asks for reminders. */
  enabled: boolean
  /**
   * Per-section switches. These sit UNDER `enabled` and default true, so opting in
   * gives you everything and you narrow from there. The point is that someone who
   * doesn't keep animals can silence chores without abandoning the channel entirely
   * -- an all-or-nothing switch gets turned off, and then we've lost the only
   * retention lever we have.
   */
  schoolEnabled: boolean
  choresEnabled: boolean
  equipmentEnabled: boolean
  schoolWeekdaysOnly: boolean
  schoolStaleDays: number
  renagDays: number
}

export type ReminderSnapshot = {
  /** Central-time calendar date, YYYY-MM-DD. Use appToday() from src/lib/date.ts. */
  todayISO: string
  /** Weekday of todayISO in the app's home timezone. Passed in, never derived here. */
  weekday: Weekday
  /** Most recent daily_log.log_date for the household, or null if none exists. */
  lastSchoolLogDate: string | null
  /** No children => this household isn't homeschooling; never nag about school logs. */
  hasChildren: boolean
  chores: { id: string; name: string; nextDueDate: string }[]
  services: { id: string; name: string; equipmentName: string; nextDueDate: string }[]
  /** `${itemType}:${itemKey}` -> the last date we mentioned it. Drives the re-nag window. */
  lastSent: Record<string, string>
  prefs: ReminderPrefs
}

export type ReminderDigest = {
  items: DueItem[]
  /**
   * Deep link as a ROUTE, never an absolute URL. A route resolves identically in an
   * email, a webview, a web-push payload and a native APNs payload — an absolute
   * URL does not, and would have to be rewritten per channel later.
   */
  route: string
}

/** Parse YYYY-MM-DD at local noon — avoids the DST/TZ off-by-one that midnight causes. */
function parseISO(iso: string): number {
  return new Date(`${iso}T12:00:00`).getTime()
}

/** Whole days from `fromISO` to `toISO`. Positive when `toISO` is later. */
export function daysBetween(fromISO: string, toISO: string): number {
  return Math.round((parseISO(toISO) - parseISO(fromISO)) / 86_400_000)
}

/**
 * Has this exact item gone quiet long enough to be mentioned again?
 *
 * Without this, anything overdue would reappear every single day until it was dealt
 * with — which trains the reader to ignore the message, and then to turn it off.
 * A never-mentioned item is always allowed through.
 */
function mayMention(
  type: ItemType,
  key: string,
  lastSent: Record<string, string>,
  todayISO: string,
  renagDays: number,
): boolean {
  const last = lastSent[`${type}:${key}`]
  if (!last) return true
  return daysBetween(last, todayISO) >= renagDays
}

/**
 * Decide the day's digest. Returns null when nothing should be sent — which is the
 * expected outcome on most days, and is a success, not a failure.
 */
export function decideReminders(s: ReminderSnapshot): ReminderDigest | null {
  if (!s.prefs.enabled) return null

  const items: DueItem[] = []
  const { renagDays } = s.prefs

  // ── School log ────────────────────────────────────────────────────────────
  // Only for households that actually have a child on the account, and (by default)
  // only on weekdays. Note the deliberate tension recorded here: the product's north
  // star is that school and life were never separate, so weekend learning is real.
  // We still default to weekdays because a wrong nudge costs more than a missed one.
  const isWeekend = s.weekday === 0 || s.weekday === 6
  const schoolInScope =
    s.prefs.schoolEnabled && s.hasChildren && !(s.prefs.schoolWeekdaysOnly && isWeekend)

  if (schoolInScope) {
    const daysStale = s.lastSchoolLogDate
      ? daysBetween(s.lastSchoolLogDate, s.todayISO)
      : Number.POSITIVE_INFINITY
    const stale = daysStale >= s.prefs.schoolStaleDays
    if (stale && mayMention('school_log', 'school_log', s.lastSent, s.todayISO, renagDays)) {
      items.push({
        type: 'school_log',
        key: 'school_log',
        lastLogDate: s.lastSchoolLogDate,
        // Infinity is correct for the never-logged case but useless in copy; the
        // renderer branches on lastLogDate === null, so clamp to a sane integer.
        daysStale: s.lastSchoolLogDate ? daysStale : 0,
      })
    }
  }

  // ── Recurring homestead chores ────────────────────────────────────────────
  for (const c of s.prefs.choresEnabled ? s.chores : []) {
    const daysOverdue = daysBetween(c.nextDueDate, s.todayISO)
    if (daysOverdue < 0) continue // not due yet
    if (!mayMention('chore', c.id, s.lastSent, s.todayISO, renagDays)) continue
    items.push({ type: 'chore', key: c.id, name: c.name, dueDate: c.nextDueDate, daysOverdue })
  }

  // ── Equipment servicing ───────────────────────────────────────────────────
  for (const sv of s.prefs.equipmentEnabled ? s.services : []) {
    const daysOverdue = daysBetween(sv.nextDueDate, s.todayISO)
    if (daysOverdue < 0) continue
    if (!mayMention('equipment_service', sv.id, s.lastSent, s.todayISO, renagDays)) continue
    items.push({
      type: 'equipment_service',
      key: sv.id,
      name: sv.name,
      equipmentName: sv.equipmentName,
      dueDate: sv.nextDueDate,
      daysOverdue,
    })
  }

  // ⭐ NEVER FIRE ON AN EMPTY DAY.
  if (items.length === 0) return null

  // Most overdue first, so the message opens with the thing that matters most.
  // school_log sorts by staleness under the same rule.
  items.sort((a, b) => overdueRank(b) - overdueRank(a))

  // Route to whichever surface the single item belongs to; a mixed digest goes to
  // the dashboard, which shows all three.
  return { items, route: routeFor(items) }
}

function overdueRank(i: DueItem): number {
  return i.type === 'school_log' ? i.daysStale : i.daysOverdue
}

function routeFor(items: DueItem[]): string {
  const types = new Set(items.map(i => i.type))
  if (types.size > 1) return '/dashboard'
  const only = items[0]
  if (only.type === 'school_log') return '/dashboard/log?focus=school'
  if (only.type === 'chore') return '/dashboard/homestead/chores'
  return '/dashboard/home-diy/equipment'
}
