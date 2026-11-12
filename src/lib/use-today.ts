'use client'

import { useEffect, useState, type Dispatch, type SetStateAction } from 'react'

/**
 * The user's local calendar date as YYYY-MM-DD — NOT UTC.
 *
 * `new Date().toISOString()` returns the UTC date, which rolls over to tomorrow
 * in the evening for US users (e.g. 9pm Central = next day UTC). For a records /
 * compliance app that attributes entries to specific days, that silently misdates
 * anything logged in the evening. Always use this for a user-facing "today".
 */
export function todayLocalISO(d: Date = new Date()): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/**
 * Default-date state for forms that default to "today".
 *
 * Hydration-safe: renders the UTC date on the server and first client paint (so
 * the server HTML and the hydration render agree), then corrects to the user's
 * local date immediately on mount. The user sees and submits their real local
 * date; React never reports a mismatch.
 *
 * Drop-in replacement for `useState(todayISO())`.
 */
export function useToday(): [string, Dispatch<SetStateAction<string>>] {
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10))
  useEffect(() => { setDate(todayLocalISO()) }, [])
  return [date, setDate]
}
