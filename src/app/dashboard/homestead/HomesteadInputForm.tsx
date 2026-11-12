'use client'

import { useEffect, useRef, useState, useTransition } from 'react'
import { addHomesteadInput } from './actions'
import { todayLocalISO } from '@/lib/use-today'

export default function HomesteadInputForm({
  section,
  suggestedCategories,
  animalTypes = [],
  projects = [],
}: {
  section: string
  suggestedCategories: string[]
  // Livestock only: the animal types this cost can be attributed to. Optional by design —
  // "Not specific to one animal" stays a first-class choice, so a bag of general supplies
  // still logs without forcing a false attribution.
  animalTypes?: { key: string; label: string }[]
  // Optional: tag this cost to a project so it rolls into that project's spend. Only rendered
  // where projects are passed (currently preservation). "Not tied to a project" stays default.
  projects?: { id: string; label: string }[]
}) {
  const formRef = useRef<HTMLFormElement>(null)
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState('')

  const listId = `categories-${section}`

  // defaultValue renders the UTC date server-side (hydration-stable); on mount,
  // correct the date input to the user's LOCAL today.
  useEffect(() => {
    const dateInput = formRef.current?.querySelector<HTMLInputElement>('input[name="input_date"]')
    if (dateInput) dateInput.value = todayLocalISO()
  }, [])

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError('')
    const formData = new FormData(e.currentTarget)
    startTransition(async () => {
      try {
        await addHomesteadInput(formData)
        formRef.current?.reset()
        // Re-set the date to today after reset
        const dateInput = formRef.current?.querySelector<HTMLInputElement>('input[name="input_date"]')
        if (dateInput) dateInput.value = todayLocalISO()
      } catch {
        setError('Failed to save. Please try again.')
      }
    })
  }

  return (
    <div className="bg-card border border-line rounded-xl p-5 space-y-4">
      <datalist id={listId}>
        {suggestedCategories.map(c => (
          <option key={c} value={c} />
        ))}
      </datalist>

      <form ref={formRef} onSubmit={handleSubmit} className="space-y-4">
        <input type="hidden" name="section" value={section} />

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium text-muted uppercase tracking-wider mb-1.5" htmlFor="category-1">Category</label>
            <input id="category-1"
              type="text"
              name="category"
              list={listId}
              required
              placeholder="e.g. Chickens"
              className="w-full bg-elevated border border-line-strong h-10 rounded-lg px-3 py-2 text-content text-sm placeholder-subtle focus:outline-none focus:border-red-600"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-muted uppercase tracking-wider mb-1.5" htmlFor="date-2">Date</label>
            <input id="date-2"
              type="date"
              name="input_date"
              required
              defaultValue={new Date().toISOString().slice(0, 10)}
              className="appearance-none w-full bg-elevated border border-line-strong h-10 rounded-lg px-3 py-2 text-content text-sm focus:outline-none focus:border-red-600"
            />
          </div>
        </div>

        <div>
          <label className="block text-xs font-medium text-muted uppercase tracking-wider mb-1.5" htmlFor="item-3">Item</label>
          <input id="item-3"
            type="text"
            name="item"
            required
            placeholder="e.g. Chicken feed, Bedding"
            className="w-full bg-elevated border border-line-strong h-10 rounded-lg px-3 py-2 text-content text-sm placeholder-subtle focus:outline-none focus:border-red-600"
          />
        </div>

        {section === 'livestock' && animalTypes.length > 0 && (
          <div>
            <label className="block text-xs font-medium text-muted uppercase tracking-wider mb-1.5" htmlFor="input-animal-type">
              For which animal? <span className="text-subtle normal-case font-normal">(optional)</span>
            </label>
            <select id="input-animal-type"
              name="animal_type"
              defaultValue=""
              className="w-full bg-elevated border border-line-strong h-10 rounded-lg px-3 py-2 text-content text-sm focus:outline-none focus:border-red-600"
            >
              <option value="">Not specific to one animal</option>
              {animalTypes.map(a => (
                <option key={a.key} value={a.key}>{a.label}</option>
              ))}
            </select>
            <p className="text-xs text-subtle mt-1">Attributing a cost lets Intelligence show profit per animal.</p>
          </div>
        )}

        {projects.length > 0 && (
          <div>
            <label className="block text-xs font-medium text-muted uppercase tracking-wider mb-1.5" htmlFor="input-project">
              For which project? <span className="text-subtle normal-case font-normal">(optional)</span>
            </label>
            <select id="input-project"
              name="project_id"
              defaultValue=""
              className="w-full bg-elevated border border-line-strong h-10 rounded-lg px-3 py-2 text-content text-sm focus:outline-none focus:border-red-600"
            >
              <option value="">Not tied to a project</option>
              {projects.map(p => (
                <option key={p.id} value={p.id}>{p.label}</option>
              ))}
            </select>
            <p className="text-xs text-subtle mt-1">Tagging a cost rolls it into that project&apos;s spend.</p>
          </div>
        )}

        <div className="grid grid-cols-3 gap-3">
          <div>
            <label className="block text-xs font-medium text-muted uppercase tracking-wider mb-1.5" htmlFor="qty-optional-4">Qty (optional)</label>
            <input id="qty-optional-4"
              type="number"
              name="quantity"
              step="0.01"
              min="0"
              placeholder="0"
              className="w-full bg-elevated border border-line-strong h-10 rounded-lg px-3 py-2 text-content text-sm placeholder-subtle focus:outline-none focus:border-red-600"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-muted uppercase tracking-wider mb-1.5" htmlFor="unit-optional-5">Unit (optional)</label>
            <input id="unit-optional-5"
              type="text"
              name="unit"
              placeholder="lbs, bags, etc."
              className="w-full bg-elevated border border-line-strong h-10 rounded-lg px-3 py-2 text-content text-sm placeholder-subtle focus:outline-none focus:border-red-600"
            />
          </div>
          <div>
            <label htmlFor="homestead-input-cost" className="block text-xs font-medium text-muted uppercase tracking-wider mb-1.5">Cost ($)</label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-subtle text-sm">$</span>
              <input
                id="homestead-input-cost"
                type="number"
                name="cost"
                required
                step="0.01"
                min="0"
                placeholder="0.00"
                className="w-full bg-elevated border border-line-strong h-10 rounded-lg pl-6 pr-3 py-2 text-content text-sm placeholder-subtle focus:outline-none focus:border-red-600"
              />
            </div>
          </div>
        </div>

        <div>
          <label className="block text-xs font-medium text-muted uppercase tracking-wider mb-1.5" htmlFor="notes-optional-6">Notes (optional)</label>
          <textarea id="notes-optional-6"
            name="notes"
            rows={2}
            placeholder="Any details worth noting..."
            className="w-full bg-elevated border border-line-strong rounded-lg px-3 py-2 text-content text-sm placeholder-subtle focus:outline-none focus:border-red-600 resize-none"
          />
        </div>

        {error && <p className="text-red-600 dark:text-red-400 text-sm">{error}</p>}

        <button
          type="submit"
          disabled={isPending}
          className="w-full bg-red-700 hover:bg-red-600 disabled:opacity-50 text-white font-bold py-3 rounded-xl transition-colors"
        >
          {isPending ? 'Saving...' : 'Log Input'}
        </button>
      </form>
    </div>
  )
}
