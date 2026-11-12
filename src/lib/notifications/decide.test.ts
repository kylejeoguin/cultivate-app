/**
 * Behaviour tests for the reminder decision layer.
 *
 * Run: npx tsx src/lib/notifications/decide.test.ts
 *
 * These exist because reminder bugs are INVISIBLE IN PRODUCTION — you cannot see an
 * email that should not have been sent, and you cannot see one that silently wasn't.
 * decide.ts is a pure function precisely so it can be checked here without a database,
 * a clock, or a mail provider.
 */

import { decideReminders, type ReminderPrefs, type ReminderSnapshot, type Weekday } from './decide'

let passed = 0
const failures: string[] = []

function check(name: string, cond: boolean) {
  if (cond) passed++
  else failures.push(name)
}

const PREFS: ReminderPrefs = {
  enabled: true,
  schoolEnabled: true,
  choresEnabled: true,
  equipmentEnabled: true,
  schoolWeekdaysOnly: true,
  schoolStaleDays: 3,
  renagDays: 3,
}

/** A Wednesday, with one stale school log, one overdue chore, one overdue service. */
function snap(over: Partial<ReminderSnapshot> = {}): ReminderSnapshot {
  return {
    todayISO: '2026-08-05',
    weekday: 3 as Weekday,
    lastSchoolLogDate: '2026-07-20',
    hasChildren: true,
    chores: [{ id: 'c1', name: 'Mow the grass', nextDueDate: '2026-08-01' }],
    services: [{ id: 's1', name: 'Filter change', equipmentName: 'Tractor', nextDueDate: '2026-07-30' }],
    lastSent: {},
    prefs: PREFS,
    ...over,
  }
}

const types = (s: ReminderSnapshot) => new Set((decideReminders(s)?.items ?? []).map(i => i.type))

// ── Baseline ────────────────────────────────────────────────────────────────
check('all three fire when everything is due', types(snap()).size === 3)

// ⭐ The rule that matters most.
check(
  'NEVER fires on an empty day',
  decideReminders(snap({ lastSchoolLogDate: '2026-08-05', chores: [], services: [] })) === null,
)

check('master switch off => nothing', decideReminders(snap({ prefs: { ...PREFS, enabled: false } })) === null)

// ── Per-section toggles (added 2026-08-07) ──────────────────────────────────
check(
  'school off => no school item, others survive',
  !types(snap({ prefs: { ...PREFS, schoolEnabled: false } })).has('school_log') &&
    types(snap({ prefs: { ...PREFS, schoolEnabled: false } })).size === 2,
)
check(
  'chores off => no chore item, others survive',
  !types(snap({ prefs: { ...PREFS, choresEnabled: false } })).has('chore') &&
    types(snap({ prefs: { ...PREFS, choresEnabled: false } })).size === 2,
)
check(
  'equipment off => no service item, others survive',
  !types(snap({ prefs: { ...PREFS, equipmentEnabled: false } })).has('equipment_service') &&
    types(snap({ prefs: { ...PREFS, equipmentEnabled: false } })).size === 2,
)
check(
  'ALL sections off => nothing sent, even with items due',
  decideReminders(
    snap({ prefs: { ...PREFS, schoolEnabled: false, choresEnabled: false, equipmentEnabled: false } }),
  ) === null,
)

// ── Pre-existing rules must survive the change ──────────────────────────────
check(
  'no children => never nag about school',
  !types(snap({ hasChildren: false })).has('school_log'),
)
check(
  'weekday-only suppresses school on a Sunday',
  !types(snap({ weekday: 0 as Weekday })).has('school_log'),
)
check(
  're-nag window suppresses a recently-mentioned chore',
  !types(snap({ lastSent: { 'chore:c1': '2026-08-04' } })).has('chore'),
)
check(
  're-nag window expired => chore returns',
  types(snap({ lastSent: { 'chore:c1': '2026-08-01' } })).has('chore'),
)
check(
  'not-yet-due items are excluded',
  !types(snap({ chores: [{ id: 'c1', name: 'Later', nextDueDate: '2026-09-01' }] })).has('chore'),
)
check(
  'most overdue sorts first',
  decideReminders(snap())?.items[0]?.type === 'school_log', // 16 days stale beats 4 and 6 days overdue
)
check(
  'single-type digest deep-links to that surface',
  decideReminders(snap({ lastSchoolLogDate: '2026-08-05', services: [] }))?.route ===
    '/dashboard/homestead/chores',
)
check('mixed digest routes to the dashboard', decideReminders(snap())?.route === '/dashboard')

// ── Report ──────────────────────────────────────────────────────────────────
const total = passed + failures.length
if (failures.length) {
  console.error(`✗ ${failures.length}/${total} FAILED:`)
  for (const f of failures) console.error(`   - ${f}`)
  process.exit(1)
}
console.log(`✓ ${passed}/${total} reminder decision behaviours pass`)
