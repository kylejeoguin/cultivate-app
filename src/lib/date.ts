/**
 * "Today" in the app's home timezone (US Central / America/Chicago) as YYYY-MM-DD.
 *
 * Server-side daily windows — like the Spark usage cap — must reset on a fixed,
 * predictable calendar day, NOT UTC. On Vercel the server runs in UTC, so
 * `new Date().toISOString()` rolls over to tomorrow at ~6-7pm Central and would
 * reset a user's daily quota mid-evening. We pin the reset to Central — the
 * business's home timezone — so "a day" means the same Central-time day for the
 * page read and the API write. DST (CST↔CDT) is handled by Intl automatically.
 *
 * For a *per-user* local date on the client, use todayLocalISO() in use-today.ts.
 */
export function appToday(d: Date = new Date()): string {
  // en-CA formats as YYYY-MM-DD.
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Chicago',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(d)
}

export const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]
// Meteorological seasons (northern hemisphere — all users are US).
const SEASONS = [
  'winter', 'winter', 'spring', 'spring', 'spring', 'summer',
  'summer', 'summer', 'fall', 'fall', 'fall', 'winter',
]

/**
 * Human "time of year" for seasonal prompt context, in the app's home timezone.
 * e.g. "early January (winter)" — so AI-generated suggestions can match activities
 * to what's actually available now (a dormant winter garden vs. a summer harvest),
 * combined with the family's known state/climate. Northern-hemisphere only.
 */
export function seasonContext(d: Date = new Date()): string {
  const [, m, day] = appToday(d).split('-').map(Number)
  const part = day <= 10 ? 'early' : day <= 20 ? 'mid' : 'late'
  return `${part} ${MONTHS[m - 1]} (${SEASONS[m - 1]})`
}
