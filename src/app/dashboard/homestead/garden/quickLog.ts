import { builtinUnitsFor } from '@/lib/units'
import type { GardenEntry } from '@/lib/types'
import type { QuickLogConfig } from '../QuickLog'

// A garden's routine production event is the HARVEST. Planting a crop is a lifecycle
// decision that belongs in the entry form below (variety, bed, expected harvest); picking
// it is the thing you do over and over, phone in hand, standing in the row.
//
// The harvest always targets a specific OPEN planting by id, so the RPC closes that exact
// row rather than fuzzy-matching a crop name. That path fails loud on a miss — no orphan
// rows, no duplicate crop entries, no phantom lifecycle. If nothing is open there is
// nothing to harvest, and the page says so instead of rendering an empty dropdown.

/** Plantings a harvest can close: still in the ground. Matches the RPC's own predicate. */
export function openPlantings(entries: GardenEntry[]): GardenEntry[] {
  return entries.filter(e => e.status === 'planted' || e.status === 'growing')
}

function label(e: GardenEntry): string {
  if (!e.date_planted) return e.crop_name
  const when = new Date(e.date_planted + 'T12:00:00')
    .toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  return `${e.crop_name} — planted ${when}`
}

export function gardenQuickLog(open: GardenEntry[]): QuickLogConfig {
  const first = open[0]
  const unitFor = (entry: GardenEntry | undefined) =>
    entry?.unit ?? builtinUnitsFor({ subModule: 'garden' })[0] ?? 'lbs'

  return {
    subModule: 'garden',
    // Produce revenue is real revenue. garden_entries carries disposition/sale_amount/sale_qty
    // and every revenue read now sums garden alongside livestock.
    showSale: true,
    fields: [
      {
        kind: 'select',
        name: 'garden_entry_id',
        label: 'Crop',
        options: open.map(e => ({ value: e.id, label: label(e) })),
      },
      { kind: 'number', name: 'quantity', label: 'Harvested', placeholder: '0' },
      { kind: 'unit', name: 'unit', label: 'Unit' },
    ],
    initialValues: {
      garden_entry_id: first?.id ?? '',
      quantity: '',
      // Reuse the unit the crop was already measured in, when it has one.
      unit: unitFor(first),
    },
    unitsFor: () => builtinUnitsFor({ subModule: 'garden' }),
    // Switching crop re-defaults the unit to whatever that crop already uses.
    onChange: (name, value, values) =>
      name === 'garden_entry_id'
        ? { ...values, garden_entry_id: value, unit: unitFor(open.find(e => e.id === value)) }
        : { ...values, [name]: value },
    validate: v => {
      if (!v.garden_entry_id) return 'Pick a crop to harvest.'
      const q = parseFloat(v.quantity)
      if (!v.quantity.trim() || Number.isNaN(q)) return 'Enter how much you harvested.'
      if (q < 0) return 'A harvest amount cannot be negative.'
      if (!v.unit) return 'Pick a unit.'
      return null
    },
    // garden_event 'harvest' is explicit: the RPC must never infer the stage from quantity.
    // Garden notes go to `garden_notes`, not the event-level `notes`: the RPC's garden branch
    // writes that column, and an empty string leaves the planting's existing note intact.
    buildHomestead: v => ({
      garden_entry_id: v.garden_entry_id,
      garden_event: 'harvest',
      quantity: v.quantity,
      unit: v.unit,
      garden_notes: v.notes ?? '',
    }),
  }
}
