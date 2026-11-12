// Canonical date formatting for the dashboard.
//
// WHY (BUILD-BIBLE Dim 1): `formatDate` was defined FIFTEEN times across the dashboard, in FOUR
// different formats and with three different null behaviours — some returned null, one returned
// an em dash, nine assumed non-null. The same date therefore rendered differently depending on
// which page you were on, and a change to date handling had to be found and reapplied fifteen
// times.
//
// The fix is NOT one format. Different surfaces legitimately want different things: a school-day
// list wants the weekday, a compliance report wants the year, a dense feed wants neither. So this
// is one implementation with named intents — every existing output is preserved exactly, and
// nothing visible changed when the call sites were switched over.
//
// All of them anchor at local noon before formatting. A bare YYYY-MM-DD parses as UTC midnight,
// which renders as the PREVIOUS day for anyone west of Greenwich and shifts again across a DST
// boundary. Noon is far enough from both edges to be stable everywhere.
//
// Null handling is deliberately NOT hidden inside these. Callers guard explicitly
// (`d ? formatDate(d) : '—'`), so what happens with a missing date is visible where it matters
// instead of being a silent property of the formatter.

function atNoon(dateStr: string): Date {
  return new Date(dateStr + 'T12:00:00')
}

/** "Sep 1, 2026" — the default. Use when the year matters: reports, service history, records. */
export function formatDate(dateStr: string): string {
  return atNoon(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

/** "Sep 1" — dense lists where the year is obvious from context. */
export function formatDateShort(dateStr: string): string {
  return atNoon(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

/** "Mon, Sep 1" — school days and activity logs, where which day of the week it was matters. */
export function formatDateWeekday(dateStr: string): string {
  return atNoon(dateStr).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
}

/** "September 1, 2026" — formal/printed surfaces such as the portfolio. */
export function formatDateLong(dateStr: string): string {
  return atNoon(dateStr).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
}
