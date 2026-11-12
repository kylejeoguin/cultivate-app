// Where a garden event sits in the crop's lifecycle. The single source of truth for
// this classification — imported by BOTH the AI router (`/api/route-log`) and the
// confirm card (`UniversalLogForm`) so the two can never drift apart.
//
// History: this used to be inferred from quantity alone, in one line of the confirm
// card: `garden_status = harvestQty ? 'harvested' : 'planted'`. Quantity was the only
// signal, so every garden event without a number fell through to 'planted'. "Weeded the
// tomato bed" became a phantom PLANTING row — which never closes, counts against the
// garden success rate, and silently poisons yield and cost-vs-yield. A planting legitimately
// has no quantity, so quantity could never have carried this decision.
export type GardenEvent = 'planting' | 'harvest' | 'tending'

export const GARDEN_EVENTS: readonly GardenEvent[] = ['planting', 'harvest', 'tending'] as const

// Verbs that put a crop IN the ground.
const PLANTING_VERBS = /\b(planted|planting|sowed|sowing|seeded|seeding|transplant\w*|set out|put in|started (?:the )?seeds)\b/i

// Verbs that take a crop OUT of the ground.
const HARVEST_VERBS = /\b(harvest\w*|picked|picking|pulled|dug|digging|gathered|gathering|cut|gleaned)\b/i

function isGardenEvent(v: unknown): v is GardenEvent {
  return typeof v === 'string' && (GARDEN_EVENTS as readonly string[]).includes(v)
}

/**
 * Resolve a garden event's lifecycle stage.
 *
 * Priority:
 *   1. A detected SALE ⇒ 'harvest', and it OVERRIDES the model. Produce cannot be sold off a
 *      crop that is merely being tended — it had to come out of the ground first. The model
 *      really does return tending for "sold $45 of produce at market", and because tending
 *      writes no row, that would throw the sale away entirely.
 *   2. The AI's explicit `garden_event`, when it is one of the three valid values.
 *   3. A stated yield ⇒ something was picked ⇒ 'harvest'.
 *   4. The verb in the event text ("planted" / "picked").
 *   5. 'tending' — the SAFE default. Tending writes no row, so an unresolved event
 *      costs the user a record they can add by hand. Defaulting to 'planting' instead
 *      would write a wrong row they may never notice. Never guess toward a write.
 */
export function resolveGardenEvent(input: {
  garden_event?: unknown
  quantity?: number | string | null
  description?: string | null
  sale_detected?: boolean | null
  sale_amount?: number | null
}): GardenEvent {
  if (input.sale_detected || (input.sale_amount != null && input.sale_amount > 0)) return 'harvest'

  if (isGardenEvent(input.garden_event)) return input.garden_event

  const qty = typeof input.quantity === 'string' ? parseFloat(input.quantity) : input.quantity
  if (qty != null && Number.isFinite(qty) && qty > 0) return 'harvest'

  const text = (input.description ?? '').trim()
  if (text) {
    // Check harvest first: "picked the beans we planted in May" is a harvest.
    if (HARVEST_VERBS.test(text)) return 'harvest'
    if (PLANTING_VERBS.test(text)) return 'planting'
  }

  return 'tending'
}

/** The `garden_entries.status` a lifecycle stage maps to. Tending maps to nothing — it writes no row. */
export function gardenStatusFor(event: GardenEvent): 'planted' | 'harvested' | null {
  if (event === 'harvest') return 'harvested'
  if (event === 'planting') return 'planted'
  return null
}
