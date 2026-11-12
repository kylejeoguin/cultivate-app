'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { todayLocalISO } from '@/lib/use-today'
import { daysUntil } from '@/lib/dueDates'
import type { EquipmentService } from '@/lib/types'

// The "current engine hours" we know for this machine = the most recent hours reading logged
// against any of its services. Used to show how close each hours-based service is to due.
function currentHoursOf(services: EquipmentService[]): number | null {
  const hrs = services.map(s => s.last_service_hours).filter((h): h is number => h != null)
  return hrs.length ? Math.max(...hrs) : null
}


async function post(body: Record<string, unknown>) {
  const res = await fetch('/api/equipment-service', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  })
  return res.ok
}

export default function ServicesManager({
  equipmentId, services,
}: {
  equipmentId: string
  services: EquipmentService[]
}) {
  const router = useRouter()
  const [adding, setAdding] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [loggingId, setLoggingId] = useState<string | null>(null)
  const currentHours = currentHoursOf(services)

  return (
    <div className="mt-3 space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold text-subtle uppercase tracking-wider">Services</span>
        {currentHours != null && <span className="text-xs text-subtle">~{currentHours} hrs</span>}
      </div>

      {services.length === 0 && !adding && (
        <p className="text-xs text-subtle">No services set up yet — add one to track its interval.</p>
      )}

      <div className="space-y-2">
        {services.map(s => (
          <ServiceRow
            key={s.id}
            service={s}
            currentHours={currentHours}
            equipmentId={equipmentId}
            editing={editingId === s.id}
            logging={loggingId === s.id}
            onEdit={() => { setEditingId(s.id); setLoggingId(null) }}
            onLog={() => { setLoggingId(s.id); setEditingId(null) }}
            onDone={() => { setEditingId(null); setLoggingId(null); router.refresh() }}
            onCancel={() => { setEditingId(null); setLoggingId(null) }}
          />
        ))}
      </div>

      {adding ? (
        <ServiceForm
          equipmentId={equipmentId}
          onDone={() => { setAdding(false); router.refresh() }}
          onCancel={() => setAdding(false)}
        />
      ) : (
        <button onClick={() => setAdding(true)} className="text-xs text-sky-600 dark:text-sky-400 hover:text-sky-700 dark:hover:text-sky-300 font-medium transition-colors">
          + Add service type
        </button>
      )}
    </div>
  )
}

function dueLabel(s: EquipmentService, currentHours: number | null): { text: string; tone: 'overdue' | 'soon' | 'ok' | 'none' } {
  if (s.interval_unit === 'hours') {
    if (s.next_due_hours == null) return { text: 'No target set', tone: 'none' }
    if (currentHours == null) return { text: `Due at ${s.next_due_hours} hrs`, tone: 'ok' }
    const toGo = s.next_due_hours - currentHours
    if (toGo < 0) return { text: `${Math.abs(Math.round(toGo))} hrs overdue`, tone: 'overdue' }
    if (toGo <= 20) return { text: `${Math.round(toGo)} hrs to go`, tone: 'soon' }
    return { text: `${Math.round(toGo)} hrs to go`, tone: 'ok' }
  }
  const d = daysUntil(s.next_due_date)
  if (d == null) return { text: 'No date set', tone: 'none' }
  if (d < 0) return { text: `${Math.abs(d)}d overdue`, tone: 'overdue' }
  if (d <= 30) return { text: `Due in ${d}d`, tone: 'soon' }
  return { text: `Due in ${d}d`, tone: 'ok' }
}

const TONE: Record<string, string> = {
  overdue: 'text-red-600 dark:text-red-400 font-semibold',
  soon: 'text-amber-600 dark:text-amber-400',
  ok: 'text-subtle',
  none: 'text-subtle',
}

function ServiceRow({
  service, currentHours, equipmentId, editing, logging, onEdit, onLog, onDone, onCancel,
}: {
  service: EquipmentService
  currentHours: number | null
  equipmentId: string
  editing: boolean
  logging: boolean
  onEdit: () => void
  onLog: () => void
  onDone: () => void
  onCancel: () => void
}) {
  const [busy, setBusy] = useState(false)
  const due = dueLabel(service, currentHours)
  const intervalText = service.interval_value
    ? `every ${service.interval_value} ${service.interval_unit === 'hours' ? 'hrs' : 'days'}`
    : 'no interval'

  if (editing) return <ServiceForm equipmentId={equipmentId} service={service} onDone={onDone} onCancel={onCancel} />
  if (logging) return <LogServiceForm service={service} equipmentId={equipmentId} onDone={onDone} onCancel={onCancel} />

  async function del() {
    setBusy(true)
    await post({ action: 'delete_service', serviceId: service.id, equipmentId })
    onDone()
  }

  return (
    <div className="bg-elevated/50 border border-line/60 rounded-lg px-3 py-2">
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0">
          <span className="text-sm font-medium text-content">{service.name}</span>
          <span className="text-xs text-subtle ml-2">{intervalText}</span>
        </div>
        <span className={`text-xs shrink-0 ${TONE[due.tone]}`}>{due.text}</span>
      </div>
      {service.notes && <p className="text-xs text-subtle mt-0.5">{service.notes}</p>}
      <div className="flex items-center gap-2 mt-1.5">
        <button onClick={onLog} className="text-xs bg-sky-100 dark:bg-sky-900/40 hover:bg-sky-200 dark:hover:bg-sky-900/70 text-sky-700 dark:text-sky-400 px-2.5 py-1 rounded-md transition-colors font-medium">Log service</button>
        <button onClick={onEdit} className="text-xs text-subtle hover:text-content px-1.5 py-1 rounded-md transition-colors">Edit</button>
        <button onClick={del} disabled={busy} className="text-xs text-subtle hover:text-red-600 dark:hover:text-red-400 px-1.5 py-1 rounded-md transition-colors ml-auto disabled:opacity-50">Remove</button>
      </div>
    </div>
  )
}

function ServiceForm({
  equipmentId, service, onDone, onCancel,
}: {
  equipmentId: string
  service?: EquipmentService
  onDone: () => void
  onCancel: () => void
}) {
  const [name, setName] = useState(service?.name ?? '')
  const [unit, setUnit] = useState<'days' | 'hours'>(service?.interval_unit ?? 'days')
  const [interval, setInterval] = useState(service?.interval_value?.toString() ?? '')
  const [dueDate, setDueDate] = useState(service?.next_due_date ?? '')
  const [dueHours, setDueHours] = useState(service?.next_due_hours?.toString() ?? '')
  const [notes, setNotes] = useState(service?.notes ?? '')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function save() {
    if (!name.trim()) return
    setBusy(true); setError('')
    const ok = await post({
      action: 'save_service', equipmentId, serviceId: service?.id,
      name: name.trim(),
      intervalUnit: unit,
      intervalValue: interval ? parseInt(interval) : null,
      nextDueDate: unit === 'days' ? (dueDate || null) : null,
      nextDueHours: unit === 'hours' && dueHours ? parseFloat(dueHours) : null,
      notes: notes.trim() || null,
    })
    setBusy(false)
    if (ok) onDone(); else setError('Could not save. Try again.')
  }

  const field = 'w-full bg-elevated border border-line-strong h-9 rounded-lg px-2.5 text-content text-sm placeholder-subtle focus:outline-none focus:border-sky-600'

  return (
    <div className="bg-card border border-line rounded-lg p-3 space-y-2.5">
      <input value={name} onChange={e => setName(e.target.value)} placeholder="Service name (e.g. Engine oil)" className={field} />
      <div className="flex gap-2">
        <button type="button" onClick={() => setUnit('days')} className={`flex-1 h-9 rounded-lg text-xs font-medium border transition-colors ${unit === 'days' ? 'bg-sky-100 dark:bg-sky-900/40 border-sky-300 dark:border-sky-700 text-sky-800 dark:text-sky-300' : 'bg-elevated border-line-strong text-muted'}`}>By time (days)</button>
        <button type="button" onClick={() => setUnit('hours')} className={`flex-1 h-9 rounded-lg text-xs font-medium border transition-colors ${unit === 'hours' ? 'bg-sky-100 dark:bg-sky-900/40 border-sky-300 dark:border-sky-700 text-sky-800 dark:text-sky-300' : 'bg-elevated border-line-strong text-muted'}`}>By engine hours</button>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="block text-xs text-subtle mb-1">Interval ({unit === 'hours' ? 'hours' : 'days'})</label>
          <input type="number" min="1" value={interval} onChange={e => setInterval(e.target.value)} placeholder={unit === 'hours' ? 'e.g. 100' : 'e.g. 90'} className={field} />
        </div>
        <div>
          <label className="block text-xs text-subtle mb-1">Next due {unit === 'hours' ? '(at hrs)' : '(date)'}</label>
          {unit === 'days'
            ? <input type="date" value={dueDate} onChange={e => setDueDate(e.target.value)} className={`appearance-none ${field}`} />
            : <input type="number" min="0" value={dueHours} onChange={e => setDueHours(e.target.value)} placeholder="e.g. 250" className={field} />}
        </div>
      </div>
      <input value={notes} onChange={e => setNotes(e.target.value)} placeholder="Notes (oil type, filter part #…)" className={field} />
      {error && <p className="text-xs text-red-600 dark:text-red-400">{error}</p>}
      <div className="flex gap-2">
        <button onClick={save} disabled={busy || !name.trim()} className="flex-1 bg-sky-700 hover:bg-sky-600 disabled:opacity-50 text-white text-sm font-semibold py-2 rounded-lg transition-colors">{busy ? 'Saving…' : service ? 'Save' : 'Add service'}</button>
        <button onClick={onCancel} className="text-xs text-subtle hover:text-content px-3 rounded-lg transition-colors">Cancel</button>
      </div>
    </div>
  )
}

function LogServiceForm({
  service, equipmentId, onDone, onCancel,
}: {
  service: EquipmentService
  equipmentId: string
  onDone: () => void
  onCancel: () => void
}) {
  const [date, setDate] = useState(todayLocalISO())
  const [hours, setHours] = useState('')
  const [notes, setNotes] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const wantsHours = service.interval_unit === 'hours'

  async function submit() {
    setBusy(true); setError('')
    const ok = await post({
      action: 'log_service', equipmentId, serviceId: service.id,
      serviceDate: date,
      hoursAtService: wantsHours && hours ? parseFloat(hours) : null,
      notes: notes.trim() || null,
    })
    setBusy(false)
    if (ok) onDone(); else setError('Could not log. Try again.')
  }

  const field = 'w-full bg-elevated border border-line-strong h-9 rounded-lg px-2.5 text-content text-sm placeholder-subtle focus:outline-none focus:border-sky-600'

  return (
    <div className="bg-card border border-sky-200 dark:border-sky-800/50 rounded-lg p-3 space-y-2.5">
      <p className="text-xs font-medium text-content">Log service — {service.name}</p>
      <div className="grid grid-cols-2 gap-2">
        <label className="block">
          <span className="block text-xs text-subtle mb-1">Date</span>
          <input type="date" value={date} onChange={e => setDate(e.target.value)} className={`appearance-none ${field}`} />
        </label>
        {wantsHours && (
          <label className="block">
            <span className="block text-xs text-subtle mb-1">Current engine hours</span>
            <input type="number" min="0" value={hours} onChange={e => setHours(e.target.value)} placeholder="e.g. 152" className={field} />
          </label>
        )}
      </div>
      <input value={notes} onChange={e => setNotes(e.target.value)} placeholder="What you did (optional)" className={field} />
      {error && <p className="text-xs text-red-600 dark:text-red-400">{error}</p>}
      <div className="flex gap-2">
        <button onClick={submit} disabled={busy} className="flex-1 bg-sky-700 hover:bg-sky-600 disabled:opacity-50 text-white text-sm font-semibold py-2 rounded-lg transition-colors">{busy ? 'Logging…' : 'Log it'}</button>
        <button onClick={onCancel} className="text-xs text-subtle hover:text-content px-3 rounded-lg transition-colors">Cancel</button>
      </div>
    </div>
  )
}
