// Homestead helpers.
//
// animal_type is free text (typed by the user or extracted by the AI), so the same
// animal shows up as "Chicken", "chicken", "Chickens"… and the reports/intelligence
// grouped them as separate buckets — fragmenting the by-animal breakdown and the
// per-animal profitability. We normalize at READ time (group/filter by `key`, show
// `label`) rather than mutating stored data, so a fuzzy singularization can never
// corrupt a real breed name — worst case is a cosmetic display merge.
export function normalizeAnimalType(raw: string | null | undefined): { key: string; label: string } {
  let k = (raw ?? '').trim().toLowerCase()
  if (k.endsWith('ies') && k.length > 4) k = k.slice(0, -3) + 'y'        // bunnies -> bunny
  else if (k.endsWith('s') && !k.endsWith('ss') && k.length > 3) k = k.slice(0, -1) // chickens -> chicken
  const label = k.replace(/\b\w/g, c => c.toUpperCase())
  return { key: k, label }
}
