'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { todayLocalISO } from '@/lib/use-today'
import { friendlySaveError } from '@/lib/saveErrors'
import type { Child, Subject } from '@/lib/types'
import UnitSelect from '../UnitSelect'

// ONE canonical quick-add for routine homestead production, shared by Livestock / Garden /
// Preservation. The AI log (/dashboard) stays the primary front door for narrative days;
// this is the "2 taps, not a second job" path for the repetitive daily count.
//
// The shell lives here and the per-section differences are a thin declarative config, so a
// fix to the row (a11y, error handling, success feedback) propagates to all three sections
// instead of being rediscovered per page. (BUILD-BIBLE Dim 1.)
//
// Both this and the AI log converge on the SAME `save_log_entry` RPC — two entry points,
// one atomic data path. Never insert into the production tables directly from here.

export type QuickLogValues = Record<string, string>

export type QuickLogField =
  | { kind: 'select'; name: string; label: string; options: { value: string; label: string }[] }
  | { kind: 'number'; name: string; label: string; step?: string; placeholder?: string }
  | { kind: 'text'; name: string; label: string; placeholder?: string }
  | { kind: 'unit'; name: string; label: string }

export interface QuickLogConfig {
  /** Drives which table save_log_entry writes. */
  subModule: 'livestock' | 'garden' | 'preservation'
  fields: QuickLogField[]
  /**
   * Optional extras behind "＋ More details", alongside the date and notes every section gets.
   * These carry what the retired long forms used to: livestock's specific animal and project tag.
   * A field with zero options is skipped, so a user with no animals never sees an empty picker.
   */
  moreFields?: QuickLogField[]
  initialValues: QuickLogValues
  /** Built-in unit list for the current values (delegates to lib/units). */
  unitsFor: (values: QuickLogValues) => string[]
  /** Lets a section reset dependents — e.g. changing animal resets the unit. */
  onChange?: (name: string, value: string, values: QuickLogValues) => QuickLogValues
  /** Return an error string to block the save, or null. */
  validate: (values: QuickLogValues) => string | null
  /**
   * Map values -> the homestead event body the RPC understands.
   * `values` includes the moreFields and `notes`, so a section decides where its notes land
   * (the RPC reads the event-level `notes` for livestock/preservation, but `garden_notes`
   * for garden — one of the few places the three tables genuinely differ).
   */
  buildHomestead: (values: QuickLogValues) => Record<string, unknown>
  /** Show the collapsed "sold some of this?" block. */
  showSale?: boolean
  placeholder?: string
}

export default function QuickLog({
  config,
  childList,
  subjects,
}: {
  config: QuickLogConfig
  childList: Child[]
  subjects: Subject[]
}) {
  const router = useRouter()
  const supabase = createClient()

  const [values, setValues] = useState<QuickLogValues>(config.initialValues)
  // Date + notes were the two things the long per-section forms could do that the QuickLog
  // couldn't, and the reason those forms couldn't simply be deleted. Defaults keep the happy
  // path at "pick, number, Log" — you only open this to back-date or say something.
  const [logDate, setLogDate] = useState(todayLocalISO())
  const [notes, setNotes] = useState('')
  const [saleAmount, setSaleAmount] = useState('')
  const [saleQty, setSaleQty] = useState('')
  const [schoolCredit, setSchoolCredit] = useState(false)
  const [childIds, setChildIds] = useState<string[]>([])
  const [subjectIds, setSubjectIds] = useState<string[]>([])
  const [creditHours, setCreditHours] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [logged, setLogged] = useState(false)

  // The user's own saved units, merged into the unit dropdown (same source as every other form).
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
    const { error: err } = await supabase.from('custom_units').insert({ user_id: user.id, unit: v })
    if (!err || err.code === '23505') {
      setCustomUnits(prev => prev.some(c => c.toLowerCase() === v.toLowerCase()) ? prev : [...prev, v])
    }
  }

  // "Logged ✓" is transient; clear it so a second entry doesn't read as already-saved.
  useEffect(() => {
    if (!logged) return
    const t = setTimeout(() => setLogged(false), 2500)
    return () => clearTimeout(t)
  }, [logged])

  function setField(name: string, value: string) {
    setValues(prev => (config.onChange ? config.onChange(name, value, prev) : { ...prev, [name]: value }))
  }

  function toggle(list: string[], id: string) {
    return list.includes(id) ? list.filter(x => x !== id) : [...list, id]
  }

  async function handleLog() {
    setError('')
    const invalid = config.validate(values)
    if (invalid) { setError(invalid); return }
    if (schoolCredit && childIds.length === 0) {
      setError('Pick at least one child, or turn off school credit.')
      return
    }

    setSaving(true)
    // `notes` reaches buildHomestead so each section can route it to the right column.
    const homestead: Record<string, unknown> = {
      ...config.buildHomestead({ ...values, notes: notes.trim() }),
      sub_module: config.subModule,
      school_credit: schoolCredit,
      credit_child_ids: schoolCredit ? childIds : [],
      subject_ids: schoolCredit ? subjectIds : [],
      // Clamp >= 0: a negative value would silently corrupt the compliance hour total.
      credit_hours: schoolCredit && creditHours ? String(Math.max(0, parseFloat(creditHours) || 0)) : '',
    }
    if (config.showSale && saleAmount) {
      homestead.disposition = saleQty ? 'mixed' : 'sold'
      homestead.sale_amount = saleAmount
      homestead.sale_qty = saleQty
    }

    const { error: rpcError } = await supabase.rpc('save_log_entry', {
      p_log_date: logDate,
      p_photo_urls: [],
      p_events: [{ notes: notes.trim() || null, is_homestead_day: true, homestead }],
    })

    setSaving(false)
    // Same rule as the AI log: a constraint name or a type-coercion message is never
    // something a user should read. The RPC is atomic, so their row values are intact.
    if (rpcError) { setError(friendlySaveError(rpcError)); return }

    setValues(config.initialValues)
    setNotes('')
    // Keep the date the user picked: back-dating a batch usually means back-dating the next
    // one too (you're catching up on a week of canning), and re-picking it every row is friction.
    setSaleAmount(''); setSaleQty('')
    setSchoolCredit(false); setChildIds([]); setSubjectIds([]); setCreditHours('')
    setLogged(true)
    router.refresh()
  }

  const inputCls = 'w-full bg-elevated border border-line-strong h-10 rounded-lg px-3 text-content text-sm placeholder-subtle focus:outline-none focus:border-amber-600'
  const labelCls = 'block text-xs font-medium text-muted uppercase tracking-wider mb-1.5'

  return (
    <div className="bg-card/60 border border-line rounded-xl p-4 mb-6">
      <div className="flex flex-wrap items-end gap-3">
        {config.fields.map(field => (
          <div key={field.name} className="flex-1 min-w-[8rem]">
            <label className={labelCls} htmlFor={`ql-${field.name}`}>{field.label}</label>
            {field.kind === 'select' && (
              <select id={`ql-${field.name}`} value={values[field.name] ?? ''}
                onChange={e => setField(field.name, e.target.value)} className={inputCls}>
                {field.options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            )}
            {field.kind === 'number' && (
              <input id={`ql-${field.name}`} type="number" inputMode="decimal"
                value={values[field.name] ?? ''} onChange={e => setField(field.name, e.target.value)}
                min="0" step={field.step ?? '0.5'} placeholder={field.placeholder ?? '0'}
                className={inputCls} />
            )}
            {field.kind === 'text' && (
              <input id={`ql-${field.name}`} type="text"
                value={values[field.name] ?? ''} onChange={e => setField(field.name, e.target.value)}
                placeholder={field.placeholder} className={inputCls} />
            )}
            {field.kind === 'unit' && (
              <UnitSelect id={`ql-${field.name}`} value={values[field.name] ?? ''}
                onChange={v => setField(field.name, v)} options={config.unitsFor(values)}
                customUnits={customUnits} onAddCustom={addCustomUnit}
                manageHref="/dashboard/account#units" className={inputCls} />
            )}
          </div>
        ))}

        <button onClick={handleLog} disabled={saving}
          className="shrink-0 bg-amber-700 hover:bg-amber-600 disabled:opacity-50 text-white text-sm font-semibold px-5 h-10 rounded-lg transition-colors">
          {saving ? 'Logging…' : '✓ Log'}
        </button>
      </div>

      {/* Sale + school credit are collapsed so the happy path stays: pick, number, Log. */}
      <div className="flex flex-wrap gap-x-6 gap-y-2 mt-3">
        {config.showSale && (
          <details className="group">
            <summary className="text-xs font-medium text-amber-700 dark:text-amber-400 cursor-pointer select-none list-none">
              <span className="group-open:hidden">＋ Sold some?</span>
              <span className="hidden group-open:inline">− Sale</span>
            </summary>
            <div className="flex flex-wrap items-end gap-3 mt-2">
              <div>
                <label className={labelCls} htmlFor="ql-sale-amount">Sale amount</label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-subtle text-sm">$</span>
                  <input id="ql-sale-amount" type="number" inputMode="decimal" value={saleAmount}
                    onChange={e => setSaleAmount(e.target.value)} min="0" step="0.01" placeholder="0.00"
                    className={`${inputCls} pl-6 w-32`} />
                </div>
              </div>
              <div>
                <label className={labelCls} htmlFor="ql-sale-qty">Qty sold <span className="text-subtle normal-case font-normal">(if partial)</span></label>
                <input id="ql-sale-qty" type="number" inputMode="decimal" value={saleQty}
                  onChange={e => setSaleQty(e.target.value)} min="0" step="0.5" placeholder="all"
                  className={`${inputCls} w-28`} />
              </div>
            </div>
          </details>
        )}

        {/* Date + notes (+ any per-section extras). This is what the long per-section forms
            existed for; folding it in here is what let them be deleted rather than kept as a
            second, RPC-bypassing write path. */}
        <details className="group">
          <summary className="text-xs font-medium text-muted hover:text-content cursor-pointer select-none list-none">
            <span className="group-open:hidden">＋ More details</span>
            <span className="hidden group-open:inline">− More details</span>
          </summary>
          <div className="flex flex-wrap items-end gap-3 mt-2">
            <div>
              <label className={labelCls} htmlFor="ql-log-date">Date</label>
              <input id="ql-log-date" type="date" value={logDate}
                onChange={e => setLogDate(e.target.value)}
                className={`${inputCls} appearance-none w-40`} />
            </div>
            {(config.moreFields ?? [])
              // A picker with nothing to pick is noise — skip it entirely.
              .filter(f => f.kind !== 'select' || f.options.length > 0)
              .map(field => (
                <div key={field.name} className="min-w-[10rem]">
                  <label className={labelCls} htmlFor={`ql-${field.name}`}>{field.label}</label>
                  {field.kind === 'select' && (
                    <select id={`ql-${field.name}`} value={values[field.name] ?? ''}
                      onChange={e => setField(field.name, e.target.value)} className={inputCls}>
                      {field.options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                    </select>
                  )}
                  {field.kind === 'text' && (
                    <input id={`ql-${field.name}`} type="text" value={values[field.name] ?? ''}
                      onChange={e => setField(field.name, e.target.value)}
                      placeholder={field.placeholder} className={inputCls} />
                  )}
                </div>
              ))}
            <div className="flex-1 min-w-[14rem]">
              <label className={labelCls} htmlFor="ql-notes">Notes</label>
              <input id="ql-notes" type="text" value={notes} onChange={e => setNotes(e.target.value)}
                placeholder="Recipe, source, observations, who helped…" className={inputCls} />
            </div>
          </div>
        </details>

        {childList.length > 0 && (
          <details className="group">
            <summary className="text-xs font-medium text-green-700 dark:text-green-400 cursor-pointer select-none list-none">
              <span className="group-open:hidden">＋ Counts as school?</span>
              <span className="hidden group-open:inline">− School credit</span>
            </summary>
            <div className="mt-2 space-y-3">
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={schoolCredit} onChange={e => setSchoolCredit(e.target.checked)}
                  className="w-4 h-4 accent-green-600" />
                <span className="text-sm font-medium text-green-700 dark:text-green-400">Count as school credit</span>
              </label>
              {schoolCredit && (
                <div className="space-y-3">
                  <fieldset>
                    <legend className="text-xs text-muted mb-1.5">Which child?</legend>
                    <div className="flex flex-wrap gap-2">
                      {childList.map(c => (
                        <button key={c.id} type="button" aria-pressed={childIds.includes(c.id)}
                          onClick={() => setChildIds(prev => toggle(prev, c.id))}
                          className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${
                            childIds.includes(c.id) ? 'bg-green-700 text-white' : 'bg-elevated text-content hover:bg-line-strong'
                          }`}>{c.name}</button>
                      ))}
                    </div>
                  </fieldset>
                  {subjects.length > 0 && (
                    <fieldset>
                      <legend className="text-xs text-muted mb-1.5">Subjects covered</legend>
                      <div className="flex flex-wrap gap-2">
                        {subjects.map(s => (
                          <button key={s.id} type="button" aria-pressed={subjectIds.includes(s.id)}
                            onClick={() => setSubjectIds(prev => toggle(prev, s.id))}
                            className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${
                              subjectIds.includes(s.id) ? 'bg-green-700 text-white' : 'bg-elevated text-content hover:bg-line-strong'
                            }`}>{s.name}</button>
                        ))}
                      </div>
                    </fieldset>
                  )}
                  <div>
                    <label className={labelCls} htmlFor="ql-credit-hours">Credit hours</label>
                    <input id="ql-credit-hours" type="number" inputMode="decimal" value={creditHours}
                      onChange={e => setCreditHours(e.target.value)} min="0" step="0.5" placeholder="e.g. 1.5"
                      className={`${inputCls} w-28 focus:border-green-600`} />
                  </div>
                </div>
              )}
            </div>
          </details>
        )}
      </div>

      <p aria-live="polite" className="sr-only">{logged ? 'Entry logged' : ''}</p>
      {logged && <p className="text-green-700 dark:text-green-400 text-sm mt-2 font-medium">Logged ✓</p>}
      {error && <p role="alert" className="text-red-600 dark:text-red-400 text-sm mt-2">{error}</p>}
    </div>
  )
}
