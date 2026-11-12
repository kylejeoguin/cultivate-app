
// ── READ-ONLY CARD ──────────────────────────────────────────────────────────
export function LivestockEntryCard({ entry, subjectMap, childMap, projectMap, onEdit }: {
  entry: LivestockLog
  subjectMap: Record<string, string>
  childMap: Record<string, string>
  projectMap: Record<string, string>
  onEdit: () => void
}) {
  return (
    <div className="bg-card/60 border border-line rounded-xl p-4" style={{ borderLeftColor: 'rgb(180 83 9 / 0.5)', borderLeftWidth: '2px' }}>
      <div className="flex items-center justify-between">
        <div className="font-medium text-sm">
          {entry.animal_name ?? entry.animal_type}
          {entry.quantity ? <span className="text-amber-600 dark:text-amber-400 ml-2 font-bold">{entry.quantity} {entry.unit}</span> : null}
        </div>
        <div className="flex items-center gap-2">
          {entry.project_id && projectMap[entry.project_id] && (
            <span className="text-xs bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300 px-2 py-0.5 rounded-full border border-amber-200 dark:border-amber-800/40">{projectMap[entry.project_id]}</span>
          )}
          {entry.school_credit && (
            <span className="text-xs bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300 px-2 py-0.5 rounded-full">
              {entry.credit_hours ? `${entry.credit_hours}h credit` : 'School credit'}
            </span>
          )}
          <button onClick={onEdit} className="text-xs text-subtle hover:text-content px-2 py-0.5 rounded border border-line-strong hover:border-stone-500 transition-colors">Edit</button>
        </div>
      </div>
      {(entry.disposition === 'sold' || entry.disposition === 'mixed') && (
        <p className="text-xs text-emerald-600 dark:text-emerald-400 mt-1">
          {entry.disposition === 'sold' ? 'Sold' : 'Partial sale'}
          {entry.sale_qty ? ` · ${entry.sale_qty} ${entry.unit}` : ''}
          {entry.sale_amount ? ` · $${entry.sale_amount.toFixed(2)}` : ''}
        </p>
      )}
      {entry.notes && <p className="text-xs text-muted mt-1">{entry.notes}</p>}
      {entry.school_credit && entry.child_ids?.length > 0 && (
        <div className="mt-1.5 flex flex-wrap gap-1">
          {(entry.subject_ids ?? []).map((id: string) => (
            <span key={id} className="text-xs bg-elevated text-muted px-2 py-0.5 rounded-full">{subjectMap[id] ?? id}</span>
          ))}
          <span className="text-xs text-subtle">→ {entry.child_ids.map((id: string) => childMap[id]).filter(Boolean).join(', ')}</span>
        </div>
      )}
    </div>
  )
}

// ── EDIT CARD ────────────────────────────────────────────────────────────────
import { useState, useEffect } from 'react'
import type { Subject, LivestockLog, HomesteadInput } from '@/lib/types'
import { todayLocalISO } from '@/lib/use-today'
import { createClient } from '@/lib/supabase/client'
import { builtinUnitsFor } from '@/lib/units'
import UnitSelect from '../../UnitSelect'


export function LivestockEditCard({ entry, subjects, subjectMap, childMap, onSave, onDelete, onCancel }: {
  entry: LivestockLog
  subjects: Subject[]
  subjectMap: Record<string, string>
  childMap: Record<string, string>
  onSave: (patch: Partial<LivestockLog>) => void
  onDelete: () => void
  onCancel: () => void
}) {
  const [animalType, setAnimalType] = useState(entry.animal_type ?? '')
  const [animalName, setAnimalName] = useState(entry.animal_name ?? '')
  const [quantity, setQuantity] = useState(entry.quantity?.toString() ?? '')
  const [unit, setUnit] = useState(entry.unit ?? '')
  const [notes, setNotes] = useState(entry.notes ?? '')
  const [logDate, setLogDate] = useState(entry.log_date)
  const [disposition, setDisposition] = useState(entry.disposition ?? 'personal')
  const [saleAmount, setSaleAmount] = useState(entry.sale_amount?.toString() ?? '')
  const [saving, setSaving] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)

  // Self-contained custom-unit support (this card saves via callbacks, but loads/adds
  // its own units so the dropdown matches the log forms).
  const supabase = createClient()
  const [customUnits, setCustomUnits] = useState<string[]>([])
  useEffect(() => {
    let active = true
    supabase.from('custom_units').select('unit').order('unit').then(({ data }) => {
      if (active && data) setCustomUnits(data.map(r => r.unit as string))
    })
    return () => { active = false }
  }, [supabase])
  async function addCustomUnit(u: string) {
    const v = u.trim()
    if (!v || customUnits.some(c => c.toLowerCase() === v.toLowerCase())) return
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    const { error } = await supabase.from('custom_units').insert({ user_id: user.id, unit: v })
    if (!error || error.code === '23505') {
      setCustomUnits(prev => prev.some(c => c.toLowerCase() === v.toLowerCase()) ? prev : [...prev, v])
    }
  }

  async function handleSave() {
    setSaving(true)
    await onSave({
      animal_type: animalType.trim() || null,
      animal_name: animalName.trim() || null,
      quantity: quantity ? parseFloat(quantity) : null,
      unit: unit.trim() || null,
      notes: notes.trim() || null,
      log_date: logDate,
      disposition,
      sale_amount: saleAmount ? parseFloat(saleAmount) : null,
    } as Partial<LivestockLog>)
    setSaving(false)
  }

  return (
    <div className="bg-card/80 border border-amber-200 dark:border-amber-800/60 rounded-xl p-4 space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold text-amber-600 dark:text-amber-400 uppercase tracking-wider">Editing entry</span>
        <button onClick={onCancel} className="text-xs text-subtle hover:text-content transition-colors">← Cancel</button>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs text-subtle mb-1" htmlFor="date-1">Date</label>
          <input id="date-1" type="date" value={logDate} onChange={e => setLogDate(e.target.value)}
            className="appearance-none w-full bg-elevated border border-line-strong rounded-lg px-3 py-1.5 text-content text-sm focus:outline-none focus:border-amber-600" />
        </div>
        <div>
          <label className="block text-xs text-subtle mb-1" htmlFor="animal-type-2">Animal type</label>
          <input id="animal-type-2" type="text" value={animalType} onChange={e => setAnimalType(e.target.value)} placeholder="e.g. Chickens"
            className="w-full bg-elevated border border-line-strong rounded-lg px-3 py-1.5 text-content text-sm focus:outline-none focus:border-amber-600" />
        </div>
        <div>
          <label className="block text-xs text-subtle mb-1" htmlFor="animal-name-optional-3">Animal name (optional)</label>
          <input id="animal-name-optional-3" type="text" value={animalName} onChange={e => setAnimalName(e.target.value)} placeholder="e.g. Barred Rocks"
            className="w-full bg-elevated border border-line-strong rounded-lg px-3 py-1.5 text-content text-sm focus:outline-none focus:border-amber-600" />
        </div>
        <div>
          <label className="block text-xs text-subtle mb-1" htmlFor="quantity-4">Quantity</label>
          <input id="quantity-4" type="number" value={quantity} onChange={e => setQuantity(e.target.value)} placeholder="0"
            className="w-full bg-elevated border border-line-strong rounded-lg px-3 py-1.5 text-content text-sm focus:outline-none focus:border-amber-600" />
        </div>
        <div>
          <label className="block text-xs text-subtle mb-1" htmlFor="unit-5">Unit</label>
          <UnitSelect id="unit-5" value={unit} onChange={setUnit}
            options={builtinUnitsFor({ subModule: 'livestock', animal: animalType })}
            customUnits={customUnits} onAddCustom={addCustomUnit} manageHref="/dashboard/account#units"
            className="w-full bg-elevated border border-line-strong rounded-lg px-3 py-2 text-sm text-content focus:outline-none focus:border-amber-600" />
        </div>
        <div>
          <label className="block text-xs text-subtle mb-1" htmlFor="disposition-6">Disposition</label>
          <select id="disposition-6" value={disposition} onChange={e => setDisposition(e.target.value as 'personal' | 'sold' | 'mixed')}
            className="w-full bg-elevated border border-line-strong rounded-lg px-3 py-1.5 text-content text-sm focus:outline-none focus:border-amber-600">
            <option value="personal">Personal use</option>
            <option value="sold">Sold</option>
            <option value="mixed">Mixed</option>
          </select>
        </div>
      </div>

      {(disposition === 'sold' || disposition === 'mixed') && (
        <div>
          <label className="block text-xs text-subtle mb-1" htmlFor="sale-amount-7">Sale amount ($)</label>
          <input id="sale-amount-7" type="number" value={saleAmount} onChange={e => setSaleAmount(e.target.value)} placeholder="0.00" step="0.01"
            className="w-32 bg-elevated border border-line-strong rounded-lg px-3 py-1.5 text-content text-sm focus:outline-none focus:border-amber-600" />
        </div>
      )}

      <div>
        <label className="block text-xs text-subtle mb-1" htmlFor="notes-8">Notes</label>
        <textarea id="notes-8" value={notes} onChange={e => setNotes(e.target.value)} rows={2} placeholder="Any notes..."
          className="w-full bg-elevated border border-line-strong rounded-lg px-3 py-1.5 text-content text-sm resize-none focus:outline-none focus:border-amber-600" />
      </div>

      <div className="flex items-center justify-between pt-1 border-t border-line">
        {confirmDelete ? (
          <div className="flex items-center gap-3">
            <span className="text-xs text-subtle">Delete this entry?</span>
            <button onClick={onDelete} className="text-xs text-red-600 dark:text-red-400 hover:text-red-700 dark:hover:text-red-300 font-medium">Yes, delete</button>
            <button onClick={() => setConfirmDelete(false)} className="text-xs text-subtle hover:text-content">Cancel</button>
          </div>
        ) : (
          <button onClick={() => setConfirmDelete(true)} className="text-xs text-subtle hover:text-red-600 dark:hover:text-red-400 transition-colors">Delete</button>
        )}
        <div className="flex items-center gap-3">
          <button onClick={onCancel} className="text-xs text-subtle hover:text-content transition-colors">Cancel</button>
          <button onClick={handleSave} disabled={saving}
            className="bg-amber-700 hover:bg-amber-600 disabled:opacity-50 text-white text-xs font-semibold px-4 py-1.5 rounded-lg transition-colors">
            {saving ? 'Saving...' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── INPUT EDIT CARD ──────────────────────────────────────────────────────────
export function InputEditCard({ input, onSave, onDelete, onCancel }: {
  input: HomesteadInput
  onSave: (patch: Partial<HomesteadInput>) => void
  onDelete: () => void
  onCancel: () => void
}) {
  const [item, setItem] = useState(input.item ?? '')
  const [cost, setCost] = useState(input.cost?.toString() ?? '')
  const [category, setCategory] = useState(input.category ?? '')
  const [notes, setNotes] = useState(input.notes ?? '')
  const [inputDate, setInputDate] = useState(input.input_date ?? todayLocalISO())
  const [saving, setSaving] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)

  async function handleSave() {
    setSaving(true)
    await onSave({ item: item.trim(), cost: parseFloat(cost) || 0, category: category.trim(), notes: notes.trim() || null, input_date: inputDate })
    setSaving(false)
  }

  return (
    <div className="bg-card/80 border border-red-200 dark:border-red-800/40 rounded-xl p-3 space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold text-red-600 dark:text-red-400 uppercase tracking-wider">Editing input</span>
        <button onClick={onCancel} className="text-xs text-subtle hover:text-content">← Cancel</button>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="block text-xs text-subtle mb-1" htmlFor="item-9">Item</label>
          <input id="item-9" type="text" value={item} onChange={e => setItem(e.target.value)}
            className="w-full bg-elevated border border-line-strong rounded-lg px-2.5 py-1.5 text-content text-sm focus:outline-none focus:border-red-600" />
        </div>
        <div>
          <label className="block text-xs text-subtle mb-1" htmlFor="cost-10">Cost ($)</label>
          <input id="cost-10" type="number" value={cost} onChange={e => setCost(e.target.value)} step="0.01"
            className="w-full bg-elevated border border-line-strong rounded-lg px-2.5 py-1.5 text-content text-sm focus:outline-none focus:border-red-600" />
        </div>
        <div>
          <label className="block text-xs text-subtle mb-1" htmlFor="category-11">Category</label>
          <input id="category-11" type="text" value={category} onChange={e => setCategory(e.target.value)}
            className="w-full bg-elevated border border-line-strong rounded-lg px-2.5 py-1.5 text-content text-sm focus:outline-none focus:border-red-600" />
        </div>
        <div>
          <label className="block text-xs text-subtle mb-1" htmlFor="date-12">Date</label>
          <input id="date-12" type="date" value={inputDate} onChange={e => setInputDate(e.target.value)}
            className="appearance-none w-full bg-elevated border border-line-strong rounded-lg px-2.5 py-1.5 text-content text-sm focus:outline-none focus:border-red-600" />
        </div>
      </div>
      <input type="text" value={notes} onChange={e => setNotes(e.target.value)} placeholder="Notes (optional)"
        className="w-full bg-elevated border border-line-strong rounded-lg px-2.5 py-1.5 text-content text-sm focus:outline-none focus:border-red-600" />
      <div className="flex items-center justify-between pt-1 border-t border-line">
        {confirmDelete ? (
          <div className="flex items-center gap-2">
            <span className="text-xs text-subtle">Delete?</span>
            <button onClick={onDelete} className="text-xs text-red-600 dark:text-red-400 font-medium">Yes</button>
            <button onClick={() => setConfirmDelete(false)} className="text-xs text-subtle">No</button>
          </div>
        ) : (
          <button onClick={() => setConfirmDelete(true)} className="text-xs text-subtle hover:text-red-600 dark:hover:text-red-400 transition-colors">Delete</button>
        )}
        <div className="flex gap-2">
          <button onClick={onCancel} className="text-xs text-subtle hover:text-content">Cancel</button>
          <button onClick={handleSave} disabled={saving}
            className="bg-line-strong hover:bg-stone-600 disabled:opacity-50 text-white text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors">
            {saving ? '...' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  )
}
