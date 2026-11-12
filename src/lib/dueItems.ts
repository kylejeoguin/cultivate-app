import { daysUntil } from './dueDates'

// One list for everything that is due around the place.
//
// WHY: recurring chores and equipment servicing are the SAME MECHANIC wearing different nouns —
// a last-done date, an interval, and a next-due date. The chores migration says so explicitly
// ("mirrors the equipment_maintenance reminder shape"). But in the app they lived in two
// different sections that did not know about each other, so answering "what needs doing?"
// meant visiting two pages and doing the merge in your head.
//
// This normalises both into one shape so a single surface can answer the question.

export type DueKind = 'chore' | 'equipment'

export type DueItem = {
  id: string
  kind: DueKind
  name: string
  /** ISO date (YYYY-MM-DD). Items with no date are not "due" and are filtered out upstream. */
  dueDate: string
  /** Where to go to actually deal with it. */
  href: string
}

/** Minimal row shapes — deliberately structural so callers can pass a narrow select(). */
export type ChoreRow = { id: string; name: string; next_due_date: string | null }
export type EquipmentRow = { id: string; equipment_name: string; next_service_date: string | null }

export const CHORES_HREF = '/dashboard/homestead/chores'
export const EQUIPMENT_HREF = '/dashboard/home-diy/equipment'

/**
 * Merge chores and equipment into one list, **most overdue first**.
 *
 * `withinDays` is the horizon: 0 (the default) means overdue-or-due-today only, which is what a
 * daily surface wants. A section page can pass 30 to include what is coming up.
 *
 * Rows with no scheduled date are dropped — "unscheduled" is not the same as "due", and
 * silently treating it as due is how a nag list loses the user's trust.
 */
export function toDueItems(
  chores: ChoreRow[] | null | undefined,
  equipment: EquipmentRow[] | null | undefined,
  withinDays = 0,
): DueItem[] {
  const items: DueItem[] = []

  for (const c of chores ?? []) {
    if (!c.next_due_date) continue
    items.push({ id: c.id, kind: 'chore', name: c.name, dueDate: c.next_due_date, href: CHORES_HREF })
  }

  for (const e of equipment ?? []) {
    if (!e.next_service_date) continue
    items.push({
      id: e.id,
      kind: 'equipment',
      name: e.equipment_name,
      dueDate: e.next_service_date,
      href: EQUIPMENT_HREF,
    })
  }

  return items
    .filter((i) => {
      const d = daysUntil(i.dueDate)
      return d !== null && d <= withinDays
    })
    .sort((a, b) => a.dueDate.localeCompare(b.dueDate))
}
