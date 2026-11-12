import { builtinUnitsFor } from '@/lib/units'
import { normalizeAnimalType } from '@/lib/homestead'
import type { QuickLogConfig } from '../QuickLog'

// Livestock's routine production event is the daily count (eggs, milk, lbs). Everything
// else the section needs — the animal registry, costs, history — is management, and lives
// below on the page. Sale is collapsed because most days nothing is sold.
//
// The animal picker and project tag live under "＋ More details": they came from
// LivestockLogForm, which INSERTed straight into `livestock_logs`, bypassing save_log_entry.
// Folding them in here is what allowed that form to be deleted rather than kept as a second
// write path with its own error handling and its own bugs.

export type AnimalOption = { id: string; name: string; animal_type: string }
export type ProjectOption = { id: string; title: string }

export function livestockQuickLog(
  animalTypes: { key: string; label: string }[],
  animals: AnimalOption[] = [],
  projects: ProjectOption[] = [],
): QuickLogConfig {
  const first = animalTypes[0]?.key ?? 'chicken'
  const unitFor = (animal: string) => builtinUnitsFor({ subModule: 'livestock', animal })[0] ?? 'count'

  // The picker can't narrow to the chosen animal type (this config is built outside the
  // QuickLog's own state), so name the type in each label and reject a mismatch on save.
  // Attributing a goat's milk to the chickens would quietly corrupt per-animal cost vs profit.
  const animalOptions = [
    { value: '', label: 'Not a specific animal' },
    ...animals.map(a => ({ value: a.id, label: `${a.name} (${normalizeAnimalType(a.animal_type).label})` })),
  ]
  const projectOptions = [
    { value: '', label: 'No project' },
    ...projects.map(p => ({ value: p.id, label: p.title })),
  ]

  return {
    subModule: 'livestock',
    showSale: true,
    fields: [
      { kind: 'select', name: 'animal_type', label: 'Animal', options: animalTypes.map(a => ({ value: a.key, label: a.label })) },
      { kind: 'number', name: 'quantity', label: 'Quantity', placeholder: '0' },
      { kind: 'unit', name: 'unit', label: 'Unit' },
    ],
    // A picker with only the placeholder option is skipped by the shell, so a user with no
    // named animals and no projects just sees Date + Notes.
    moreFields: [
      ...(animals.length ? [{ kind: 'select' as const, name: 'animal_id', label: 'Which animal?', options: animalOptions }] : []),
      ...(projects.length ? [{ kind: 'select' as const, name: 'project_id', label: 'Project', options: projectOptions }] : []),
    ],
    initialValues: { animal_type: first, quantity: '', unit: unitFor(first), animal_id: '', project_id: '' },
    unitsFor: v => builtinUnitsFor({ subModule: 'livestock', animal: v.animal_type }),
    // Switching animal must re-default the unit — "eggs" makes no sense once you pick Goats.
    // It also clears the named animal: a specific hen isn't a goat.
    onChange: (name, value, values) =>
      name === 'animal_type'
        ? { ...values, animal_type: value, unit: unitFor(value), animal_id: '' }
        : { ...values, [name]: value },
    validate: v => {
      const q = parseFloat(v.quantity)
      if (!v.quantity.trim() || Number.isNaN(q)) return 'Enter a quantity.'
      if (q < 0) return 'Quantity cannot be negative.'
      if (!v.unit) return 'Pick a unit.'
      if (v.animal_id) {
        const picked = animals.find(a => a.id === v.animal_id)
        if (picked && normalizeAnimalType(picked.animal_type).key !== normalizeAnimalType(v.animal_type).key) {
          return `${picked.name} isn’t a ${normalizeAnimalType(v.animal_type).label.toLowerCase()} — pick a matching animal, or clear it.`
        }
      }
      return null
    },
    buildHomestead: v => ({
      animal_type: v.animal_type,
      quantity: v.quantity,
      unit: v.unit,
      // The RPC stores both: the id links cost/profit per animal, the name renders in history.
      animal_id: v.animal_id || '',
      animal_name: animals.find(a => a.id === v.animal_id)?.name ?? '',
      project_id: v.project_id || '',
    }),
  }
}
