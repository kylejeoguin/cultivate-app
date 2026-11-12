import { test, expect } from '@playwright/test'
import { toDueItems, type ChoreRow, type EquipmentRow } from '../src/lib/dueItems'

// Pure-logic coverage for the chores + equipment merge. No browser, no secrets — runs in CI.
//
// WHY THIS EXISTS: the QA fixture happens to have no chores due, so a screenshot of the
// "What's due" list showed four equipment rows and zero chores. That is not evidence the merge
// works — it is evidence that half of it was never exercised. This tests the half the fixture
// cannot reach.

/**
 * Build an ISO date N days from today, so tests don't depend on a fixed calendar date.
 *
 * Built from LOCAL date parts, not toISOString(): the UTC date rolls over to tomorrow in the
 * evening for US timezones, so `isoOffset(0)` written the obvious way produces tomorrow after
 * ~7pm Central and "due today" silently becomes "due tomorrow". This test failed on exactly
 * that before the helper was fixed.
 */
function isoOffset(days: number): string {
  const d = new Date()
  d.setDate(d.getDate() + days)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

const chore = (id: string, name: string, days: number): ChoreRow => ({
  id,
  name,
  next_due_date: isoOffset(days),
})

const equip = (id: string, equipment_name: string, days: number): EquipmentRow => ({
  id,
  equipment_name,
  next_service_date: isoOffset(days),
})

test('merges both kinds into one list, most overdue first', () => {
  const items = toDueItems(
    [chore('c1', 'Clean the coop', -2), chore('c2', 'Feed the animals', 0)],
    [equip('e1', 'Tractor', -10), equip('e2', 'Chainsaw', -1)],
  )

  expect(items.map((i) => i.name)).toEqual(['Tractor', 'Clean the coop', 'Chainsaw', 'Feed the animals'])
  // Both kinds are actually present — the thing the screenshot could not show.
  expect(items.filter((i) => i.kind === 'chore')).toHaveLength(2)
  expect(items.filter((i) => i.kind === 'equipment')).toHaveLength(2)
})

test('due today counts as due', () => {
  const items = toDueItems([chore('c1', 'Water the beds', 0)], [])
  expect(items).toHaveLength(1)
})

test('excludes future items by default, includes them within an explicit horizon', () => {
  const chores = [chore('c1', 'Next week', 7)]
  const equipment = [equip('e1', 'Mower', 12)]

  expect(toDueItems(chores, equipment)).toHaveLength(0)
  expect(toDueItems(chores, equipment, 30)).toHaveLength(2)
})

test('drops rows with no scheduled date rather than treating them as due', () => {
  const items = toDueItems(
    [{ id: 'c1', name: 'Unscheduled chore', next_due_date: null }],
    [{ id: 'e1', equipment_name: 'Unscheduled tool', next_service_date: null }],
  )
  expect(items).toEqual([])
})

test('handles null/undefined inputs without throwing', () => {
  expect(toDueItems(null, undefined)).toEqual([])
})

test('each item carries a link to somewhere it can be acted on', () => {
  const items = toDueItems([chore('c1', 'Coop', -1)], [equip('e1', 'Tractor', -1)])
  for (const i of items) {
    expect(i.href, `${i.name} needs a destination`).toMatch(/^\/dashboard\//)
  }
})
