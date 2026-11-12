// Canonical due-date math for anything scheduled: equipment servicing, chores,
// filing deadlines.
//
// WHY THIS EXISTS (BUILD-BIBLE Dim 1 — one canonical structure per repeated pattern):
// `daysUntil` was defined SIX separate times across the dashboard — in home-diy/page,
// home-diy/equipment/page, home-diy/equipment/ServicesManager, home-diy/reports/page,
// home-diy/reports/[category]/page, and homestead/page. All six were behaviourally
// identical (same null guard, same noon anchoring, same Math.ceil); they differed only in
// whether they wrote `Date.now()` or `new Date().getTime()`, and `86400000` or the
// spelled-out product. Six copies means a fix to the date logic has to be found and
// reapplied six times, and the one you miss ships wrong.
//
// The overdue/soon/ok classification was likewise inlined at four call sites with three
// different thresholds' worth of drift risk. It lives here now too.

/**
 * Whole days from today until an ISO date (`YYYY-MM-DD`).
 *
 * Sign convention: **positive = upcoming, 0 = today, negative = overdue.**
 *
 * The date is anchored at local noon before comparing. That is deliberate: parsing a bare
 * `YYYY-MM-DD` yields UTC midnight, which lands on the previous day for anyone west of
 * Greenwich and shifts again across a DST boundary. Noon is far enough from both edges that
 * the day count is stable everywhere.
 *
 * Returns null when there is no date, so "unscheduled" stays distinguishable from "due today".
 */
export function daysUntil(dateStr: string | null | undefined): number | null {
  if (!dateStr) return null
  return Math.ceil((new Date(dateStr + 'T12:00:00').getTime() - Date.now()) / 86_400_000)
}

/** How urgent a scheduled thing is. `none` = nothing scheduled. */
export type DueStatus = 'overdue' | 'soon' | 'ok' | 'none'

/** Default window for "coming up" — matches what the equipment pages already used. */
export const DUE_SOON_DAYS = 30

/**
 * Classify a scheduled date. Mirrors the logic that was inlined at every equipment call
 * site, so the pages can stop each deciding what "due soon" means.
 */
export function dueStatus(
  dateStr: string | null | undefined,
  soonWithinDays: number = DUE_SOON_DAYS,
): DueStatus {
  const days = daysUntil(dateStr)
  if (days === null) return 'none'
  if (days < 0) return 'overdue'
  if (days <= soonWithinDays) return 'soon'
  return 'ok'
}

/**
 * Format a scheduled date for display — "Sep 1, 2026".
 *
 * Noon-anchored for the same reason as `daysUntil`: a bare YYYY-MM-DD parses as UTC midnight
 * and renders as the previous day for anyone west of Greenwich.
 *
 * NOTE: `formatDate` is currently defined FIFTEEN times across the dashboard in FOUR different
 * formats ("Mon, Sep 1" / "Sep 1, 2026" / "Sep 1" / "September 1, 2026") with three different
 * null behaviours, so the same date renders differently depending on the page. This uses the
 * most common of those (7 of 15) and is the intended landing place for that consolidation —
 * which is deliberately NOT done here, because unifying them changes visible output and that
 * is a design call, not a cleanup.
 */
export function formatDueDate(dateStr: string | null | undefined): string | null {
  if (!dateStr) return null
  return new Date(dateStr + 'T12:00:00').toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

/**
 * Human label for a due date — "3d overdue", "Due today", "Due in 5d".
 * Returns null when nothing is scheduled, so callers can render their own empty state.
 */
export function dueLabel(dateStr: string | null | undefined): string | null {
  const days = daysUntil(dateStr)
  if (days === null) return null
  if (days < 0) return `${Math.abs(days)}d overdue`
  if (days === 0) return 'Due today'
  return `Due in ${days}d`
}
