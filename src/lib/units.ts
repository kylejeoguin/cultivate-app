// Single source of truth for homestead measurement units.
//
// Every unit dropdown reads from here: the dedicated Livestock/Preservation forms AND
// the AI log's confirm step + its manual "add event" card. Built-in lists are curated
// per context (what you're logging); a user's own added units (custom_units table) are
// merged on top and shown everywhere. Keeping ONE list means a unit added anywhere is
// consistent for reports instead of fragmenting into free-text variants.

// Livestock units keyed by animal type. Matching is case- and plural-insensitive
// (the AI returns "chicken"/"chickens", the dedicated form uses "Chickens").
export const LIVESTOCK_UNITS: Record<string, string[]> = {
  chicken: ['eggs', 'lbs'],
  duck: ['eggs', 'lbs'],
  goat: ['gallons', 'lbs'],
  cow: ['gallons', 'lbs'],
  pig: ['lbs'],
  bee: ['lbs', 'jars'],
  rabbit: ['lbs'],
}
// Fallback when the animal isn't one we have a specific list for (mirrors the dedicated
// form's "Other" list, plus the common egg groupings).
const LIVESTOCK_FALLBACK = ['lbs', 'count', 'gallons', 'eggs', 'dozen']

// Preservation units keyed by method (matches the dedicated PreservationLogForm).
export const PRESERVATION_UNITS: Record<string, string[]> = {
  canning: ['jars', 'quarts', 'pints', 'half-pints'],
  freezing: ['lbs', 'bags', 'quarts', 'gallons'],
  dehydrating: ['lbs', 'oz', 'trays'],
  fermenting: ['jars', 'gallons', 'quarts'],
  other: ['lbs', 'jars', 'bags', 'count'],
}

const GARDEN_UNITS = ['lbs', 'oz', 'bunches', 'count', 'pints', 'quarts']
const GENERAL_UNITS = ['count', 'lbs', 'gallons', 'eggs', 'dozen']

// Normalize an animal string to a base key: lowercase, trimmed, trailing "s" dropped.
function animalKey(animal: string | null | undefined): string {
  return (animal ?? '').trim().toLowerCase().replace(/s$/, '')
}

// Resolve the built-in unit list for a homestead context (sub-module + optional animal
// or preservation method). Always returns a non-empty list.
export function builtinUnitsFor(ctx: {
  subModule?: string | null
  animal?: string | null
  method?: string | null
}): string[] {
  const sub = (ctx.subModule ?? '').trim().toLowerCase()

  if (sub === 'livestock' || sub === 'general') {
    const key = animalKey(ctx.animal)
    if (key && LIVESTOCK_UNITS[key]) return LIVESTOCK_UNITS[key]
    return sub === 'general' ? GENERAL_UNITS : LIVESTOCK_FALLBACK
  }
  if (sub === 'preservation') {
    const m = (ctx.method ?? 'other').trim().toLowerCase()
    return PRESERVATION_UNITS[m] ?? PRESERVATION_UNITS.other
  }
  if (sub === 'garden') return GARDEN_UNITS
  return GENERAL_UNITS
}

// Build the final ordered option list for a <select>: built-in units first, then the
// user's custom units (deduped, case-insensitive), and — so a controlled <select> never
// silently loses an AI-extracted or previously-saved value that isn't in either list —
// the current value appended if it's still missing. "＋ Add unit type…" is rendered
// separately by the component, not included here.
export function unitOptions(builtin: string[], custom: string[], current?: string | null): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  const push = (u: string) => {
    const t = (u ?? '').trim()
    if (!t) return
    const k = t.toLowerCase()
    if (seen.has(k)) return
    seen.add(k)
    out.push(t)
  }
  builtin.forEach(push)
  custom.forEach(push)
  if (current) push(current)
  return out
}

// Group units at READ time, never in storage.
//
// A unit is free text (typed, picked, or extracted by the AI), so "Eggs"/"eggs" and
// "jar"/"jars" would fragment the same measure into separate buckets in Reports and
// Intelligence — the same defect `normalizeAnimalType()` fixes for animals. Same posture:
// normalize where we group, leave the row exactly as the user recorded it. A fuzzy
// singularization can then never corrupt a real unit; the worst case is a display merge.
//
// Deliberately NOT a conversion. "1 dozen" stays 1 dozen — it does not silently become
// 12 eggs. Rewriting a quantity the user typed is a different, riskier decision than
// spelling their unit consistently, and it isn't ours to make behind their back. The AI log
// already normalizes "2 dozen" → 24 eggs at capture time, where the user confirms it.
export function normalizeUnit(raw: string | null | undefined): { key: string; label: string } {
  const trimmed = (raw ?? '').trim()
  let k = trimmed.toLowerCase()
  if (k.endsWith('ies') && k.length > 4) k = k.slice(0, -3) + 'y'          // berries -> berry
  else if (k.endsWith('es') && k.length > 4 && /(x|ch|sh|s)es$/.test(k)) k = k.slice(0, -2) // boxes -> box
  else if (k.endsWith('s') && !k.endsWith('ss') && k.length > 2) k = k.slice(0, -1)  // jars -> jar
  return { key: k, label: trimmed || k }
}

/** One measured row: whatever produced a quantity in a unit. */
export interface UnitQuantity {
  quantity: number | null
  unit: string | null
}

/** A unit bucket: the grouping `key`, the `label` to show, and the summed `total`. */
export interface UnitTotal {
  key: string
  label: string
  total: number
}

/**
 * Sum quantities into unit buckets, grouping by the normalized key but DISPLAYING the unit
 * the user actually typed (first spelling wins). Four surfaces built this map by hand and
 * keyed it on the raw string, so "Eggs" and "eggs" showed as two rows that each looked wrong.
 * Sorted largest-first — the number a homesteader cares about is the one they have most of.
 */
export function totalsByUnit(rows: readonly UnitQuantity[]): UnitTotal[] {
  const buckets = new Map<string, UnitTotal>()
  for (const row of rows) {
    if (row.quantity == null || !row.unit) continue
    const { key, label } = normalizeUnit(row.unit)
    if (!key) continue
    const existing = buckets.get(key)
    if (existing) existing.total += row.quantity
    else buckets.set(key, { key, label, total: row.quantity })
  }
  return [...buckets.values()].sort((a, b) => b.total - a.total)
}
