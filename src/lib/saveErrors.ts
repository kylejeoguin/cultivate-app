// Turn a database/RPC failure into a sentence a homeschool parent can act on.
//
// Why this exists: every homestead + school write goes through the `save_log_entry` RPC, and
// on failure the client used to render `error.message` verbatim. That meant a real user could
// be shown:
//
//   new row for relation "garden_entries" violates check constraint "garden_entries_quantity_nonneg"
//   invalid input syntax for type numeric: "a few"
//
// which is both frightening and useless (BUILD-BIBLE Dim 4: no raw error reaches the user).
// The DB constraints that produce these are correct and worth keeping — the message was the
// weak link, not the guard.
//
// Two rules:
//   1. Anything we recognize gets a specific, actionable sentence.
//   2. Anything we DON'T recognize gets a generic reassurance — never the raw text. Unknown
//      internals are exactly what must not leak. The raw error still goes to the console so
//      it's debuggable.
//
// The save is atomic, so "nothing was lost" is always literally true: a failed RPC rolls the
// whole entry back and the user's typed text is still on screen.

const GENERIC = 'We couldn’t save that. Nothing was lost — your entry is still here. Please try again.'

/** Ordered: first match wins, so put specific patterns above general ones. */
const RULES: { match: RegExp; message: string }[] = [
  // ── Our own RAISEs from save_log_entry ────────────────────────────────────
  {
    match: /garden_entry_id .* not found for this user/i,
    message: 'That planting isn’t there anymore — it may have been changed on another device. Refresh the page and pick it again.',
  },
  {
    match: /homeschool event has no children/i,
    message: 'We couldn’t tell which child this was for. Name a child on the event, then save again.',
  },
  { match: /not authenticated/i, message: 'You’ve been signed out. Sign in again — your entry is still here.' },

  // ── CHECK constraints (the shape guards) ──────────────────────────────────
  { match: /garden_entries_quantity_nonneg/i, message: 'A harvest amount can’t be negative. Enter how much you picked, or leave it blank.' },
  { match: /garden_entries_harvested_needs_date/i, message: 'A harvest needs a date. Pick the day it was harvested and try again.' },
  { match: /garden_entries_status_check/i, message: 'That crop status isn’t one we recognize. Choose planned, planted, growing, harvested, or failed.' },
  { match: /livestock_logs_disposition_check/i, message: 'That sale option isn’t one we recognize. Choose sold, partial sale, or personal use.' },
  { match: /homestead_inputs_section_check/i, message: 'That cost couldn’t be filed under a homestead section. Try again from the section page.' },

  // ── Type coercion: the AI (or a paste) handed us words where a number goes ─
  {
    match: /invalid input syntax for type numeric/i,
    message: 'One of the amounts isn’t a number. Enter a figure like 12 (or clear it), then save again.',
  },
  { match: /invalid input syntax for type date/i, message: 'One of the dates isn’t valid. Check the date and save again.' },
  { match: /invalid input syntax for type uuid/i, message: GENERIC },

  // ── Access / integrity ────────────────────────────────────────────────────
  { match: /row-level security|permission denied|42501/i, message: 'You don’t have access to that record. Refresh and try again.' },
  { match: /violates foreign key constraint/i, message: 'Something this entry points to no longer exists. Refresh the page and try again.' },
  { match: /duplicate key value|23505/i, message: 'That looks like it’s already been saved. Refresh to see it.' },
  { match: /violates not-null constraint/i, message: 'Something required is missing from that entry. Fill in the highlighted fields and try again.' },

  // ── Transport ─────────────────────────────────────────────────────────────
  { match: /fetch failed|network|timeout|ETIMEDOUT|ECONNRESET/i, message: 'We couldn’t reach the server. Check your connection — your entry is still here — and try again.' },
]

/**
 * Map a Supabase/Postgres error to a user-facing sentence.
 * Never returns raw error text. Always logs the original for debugging.
 */
export function friendlySaveError(error: unknown): string {
  const raw =
    typeof error === 'string' ? error
    : error && typeof error === 'object' && 'message' in error ? String((error as { message: unknown }).message)
    : ''

  // Keep the real thing where a developer can find it; never where a user can.
  if (raw) console.error('[save] raw error:', error)

  if (!raw) return GENERIC
  return RULES.find(r => r.match.test(raw))?.message ?? GENERIC
}

export const GENERIC_SAVE_ERROR = GENERIC
