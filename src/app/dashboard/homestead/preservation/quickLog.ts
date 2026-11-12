import { builtinUnitsFor } from '@/lib/units'
import type { PreservationMethod } from '@/lib/types'
import type { QuickLogConfig } from '../QuickLog'

// Preservation's routine event is a batch: what you put up, how, and how much of it.
//
// This replaced PreservationLogForm, which INSERTed straight into `preservation_logs` —
// a second write path that skipped save_log_entry entirely (so it could never carry school
// credit through the same code the AI log uses) and rendered raw Postgres errors to users.

const METHODS: { value: PreservationMethod; label: string }[] = [
  { value: 'canning', label: 'Canning' },
  { value: 'freezing', label: 'Freezing' },
  { value: 'dehydrating', label: 'Dehydrating' },
  { value: 'fermenting', label: 'Fermenting' },
  { value: 'other', label: 'Other' },
]

export function preservationQuickLog(): QuickLogConfig {
  const unitFor = (method: string) =>
    builtinUnitsFor({ subModule: 'preservation', method })[0] ?? 'jars'

  return {
    subModule: 'preservation',
    // A jar of jam sold at the farmstand is revenue, same as an egg. preservation_logs now
    // carries disposition/sale_amount/sale_qty and homesteadRevenue() sums it alongside the
    // other two, so the money this captures actually reaches every report.
    showSale: true,
    fields: [
      { kind: 'text', name: 'item_name', label: 'What did you preserve?', placeholder: 'e.g. Strawberry jam' },
      { kind: 'select', name: 'method', label: 'Method', options: METHODS.map(m => ({ value: m.value, label: m.label })) },
      { kind: 'number', name: 'quantity', label: 'Quantity', step: '1', placeholder: '0' },
      { kind: 'unit', name: 'unit', label: 'Unit' },
    ],
    initialValues: { item_name: '', method: 'canning', quantity: '', unit: unitFor('canning') },
    unitsFor: v => builtinUnitsFor({ subModule: 'preservation', method: v.method }),
    // Switching method must re-default the unit — "jars" makes no sense once you pick Freezing.
    onChange: (name, value, values) =>
      name === 'method'
        ? { ...values, method: value, unit: unitFor(value) }
        : { ...values, [name]: value },
    validate: v => {
      if (!v.item_name?.trim()) return 'What did you preserve?'
      const q = parseFloat(v.quantity)
      if (!v.quantity.trim() || Number.isNaN(q)) return 'Enter a quantity.'
      if (q < 0) return 'Quantity cannot be negative.'
      if (!v.unit) return 'Pick a unit.'
      return null
    },
    // `notes` rides the event-level key, which is what the RPC's preservation branch reads.
    buildHomestead: v => ({
      item_name: v.item_name.trim(),
      method: v.method,
      quantity: v.quantity,
      unit: v.unit,
    }),
  }
}
