'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import type { EquipmentMaintenance } from '@/lib/types'

const CATEGORIES = [
  { value: 'tractor', label: 'Tractor' },
  { value: 'hvac', label: 'HVAC' },
  { value: 'well', label: 'Well / Water' },
  { value: 'vehicle', label: 'Vehicle' },
  { value: 'appliance', label: 'Appliance' },
  { value: 'tool', label: 'Tool' },
  { value: 'generator', label: 'Generator' },
  { value: 'other', label: 'Other' },
]

export default function EquipmentForm({
  equipment,
  onClose,
}: {
  equipment?: EquipmentMaintenance
  onClose?: () => void
} = {}) {
  const isEdit = !!equipment
  const router = useRouter()
  const supabase = createClient()

  const [name, setName] = useState(equipment?.equipment_name ?? '')
  const [category, setCategory] = useState(equipment?.category ?? 'other')
  const [equipmentCategory, setEquipmentCategory] = useState<'home' | 'homestead'>(equipment?.equipment_category ?? 'home')
  const [location, setLocation] = useState(equipment?.location ?? '')
  const [notes, setNotes] = useState(equipment?.service_notes ?? '')
  const [purchaseDate, setPurchaseDate] = useState(equipment?.purchase_date ?? '')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [showForm, setShowForm] = useState(isEdit)

  function closeForm() {
    if (isEdit) { onClose?.(); return }
    setShowForm(false)
  }

  async function handleSave() {
    if (!name.trim()) return
    setSaving(true)
    setError('')

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    const fields = {
      equipment_name: name.trim(),
      category,
      equipment_category: equipmentCategory,
      location: location.trim() || null,
      service_notes: notes.trim() || null,
      purchase_date: purchaseDate || null,
    }

    const { error: err } = isEdit
      ? await supabase.from('equipment_maintenance').update(fields).eq('id', equipment!.id)
      : await supabase.from('equipment_maintenance').insert({ user_id: user.id, ...fields })

    if (err) {
      setError(err.message)
      setSaving(false)
      return
    }

    setSaving(false)
    router.refresh()

    if (isEdit) {
      onClose?.()
      return
    }

    setName('')
    setLocation('')
    setNotes('')
    setPurchaseDate('')
    setShowForm(false)
  }

  if (!isEdit && !showForm) {
    return (
      <button
        onClick={() => setShowForm(true)}
        className="bg-elevated hover:bg-line-strong text-content text-sm font-semibold px-4 py-1.5 rounded-lg transition-colors"
      >
        + Add Equipment
      </button>
    )
  }

  return (
    <div className="bg-card border border-line rounded-xl p-5 space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-content">{isEdit ? 'Edit Equipment' : 'Add Equipment'}</h3>
        <button onClick={closeForm} className="text-xs text-subtle hover:text-muted transition-colors">Cancel</button>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs font-medium text-muted uppercase tracking-wider mb-1.5" htmlFor="equipment-name-1">Equipment Name</label>
          <input id="equipment-name-1"
            type="text"
            value={name}
            onChange={e => setName(e.target.value)}
            placeholder="e.g. John Deere 1025R"
            className="w-full bg-elevated border border-line-strong h-10 rounded-lg px-3 py-2 text-content text-sm placeholder-subtle focus:outline-none focus:border-sky-600"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-muted uppercase tracking-wider mb-1.5" htmlFor="category-2">Category</label>
          <select id="category-2"
            value={category}
            onChange={e => setCategory(e.target.value)}
            className="w-full bg-elevated border border-line-strong h-10 rounded-lg px-3 py-2 text-content text-sm focus:outline-none focus:border-sky-600"
          >
            {CATEGORIES.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
          </select>
        </div>
      </div>

      {/* Where does this equipment live? */}
      <div>
        <span className="block text-xs font-medium text-muted uppercase tracking-wider mb-1.5">This equipment is for</span>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setEquipmentCategory('home')}
            className={`flex-1 py-2 rounded-lg text-sm font-medium transition-colors border ${equipmentCategory === 'home' ? 'bg-sky-100 dark:bg-sky-900/40 border-sky-300 dark:border-sky-700 text-sky-800 dark:text-sky-300' : 'bg-elevated border-line-strong text-muted hover:border-line-strong'}`}
          >
            🏠 Home
          </button>
          <button
            type="button"
            onClick={() => setEquipmentCategory('homestead')}
            className={`flex-1 py-2 rounded-lg text-sm font-medium transition-colors border ${equipmentCategory === 'homestead' ? 'bg-amber-100 dark:bg-amber-900/40 border-amber-300 dark:border-amber-700 text-amber-800 dark:text-amber-300' : 'bg-elevated border-line-strong text-muted hover:border-line-strong'}`}
          >
            🌾 Homestead
          </button>
        </div>
        <p className="text-xs text-subtle mt-1">Homestead equipment also shows under Household.</p>
      </div>

      <div>
        <label className="block text-xs font-medium text-muted uppercase tracking-wider mb-1.5" htmlFor="location-optional-3">Location (optional)</label>
        <input id="location-optional-3"
          type="text"
          value={location}
          onChange={e => setLocation(e.target.value)}
          placeholder="e.g. Barn, Shop, Garage"
          className="w-full bg-elevated border border-line-strong h-10 rounded-lg px-3 py-2 text-content text-sm placeholder-subtle focus:outline-none focus:border-sky-600"
        />
      </div>

      <div>
        <label className="block text-xs font-medium text-muted uppercase tracking-wider mb-1.5" htmlFor="service-notes-optional-6">Notes (optional)</label>
        <input id="service-notes-optional-6"
          type="text"
          value={notes}
          onChange={e => setNotes(e.target.value)}
          placeholder="Model #, quirks to remember..."
          className="w-full bg-elevated border border-line-strong h-10 rounded-lg px-3 py-2 text-content text-sm placeholder-subtle focus:outline-none focus:border-sky-600"
        />
        <p className="text-xs text-subtle mt-1">Add service schedules (oil, filters…) after saving — each with its own time or engine-hours interval.</p>
      </div>

      <div>
        <label className="block text-xs font-medium text-muted uppercase tracking-wider mb-1.5" htmlFor="purchase-date-optional-7">Purchase Date (optional)</label>
        <input id="purchase-date-optional-7"
          type="date"
          value={purchaseDate}
          onChange={e => setPurchaseDate(e.target.value)}
          className="appearance-none w-44 bg-elevated border border-line-strong h-10 rounded-lg px-3 py-2 text-content text-sm focus:outline-none focus:border-sky-600"
        />
      </div>

      {error && <p className="text-red-600 dark:text-red-400 text-sm">{error}</p>}

      <button
        onClick={handleSave}
        disabled={saving || !name.trim()}
        className="w-full bg-sky-700 hover:bg-sky-600 disabled:opacity-50 text-white font-bold py-3 rounded-xl transition-colors"
      >
        {saving ? 'Saving...' : isEdit ? 'Save Changes' : 'Add Equipment'}
      </button>
    </div>
  )
}
