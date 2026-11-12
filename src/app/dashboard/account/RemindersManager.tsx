'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { enablePush, pushStatus, type PushStatus } from '@/lib/push/client'

/**
 * Account → Reminders. The off-switch the digest email already promises ("turn
 * reminders off in Account settings"). Until this existed that promise could not be
 * kept, which is why no second person could be enrolled.
 *
 * These preferences are PER PERSON, not per household — two parents on a Family plan
 * each control their own. That is deliberate and matches notification_prefs, which is
 * kept out of the household-normalization trigger on purpose.
 */

export type ReminderPrefsRow = {
  enabled: boolean
  /** 'web' = phone notification (push), falling back to email when no device is registered. */
  channel: 'email' | 'web'
  destination: string | null
  send_hour_local: number
  school_enabled: boolean
  chores_enabled: boolean
  equipment_enabled: boolean
  school_weekdays_only: boolean
  school_stale_days: number
  renag_days: number
}

export const REMINDER_DEFAULTS: ReminderPrefsRow = {
  enabled: false, // opt-in: nobody is ever enrolled without asking
  channel: 'email',
  destination: null,
  send_hour_local: 19,
  school_enabled: true,
  chores_enabled: true,
  equipment_enabled: true,
  school_weekdays_only: true,
  school_stale_days: 3,
  renag_days: 3,
}

/** ONE canonical toggle. Every switch below renders through this, so a fix to focus
 *  ring, contrast, or keyboard behaviour is a single edit rather than four. */
function Toggle({
  id, label, hint, checked, disabled, onChange,
}: {
  id: string
  label: string
  hint?: string
  checked: boolean
  disabled?: boolean
  onChange: (v: boolean) => void
}) {
  return (
    <div className={`flex items-start justify-between gap-4 ${disabled ? 'opacity-50' : ''}`}>
      <div className="min-w-0">
        <label htmlFor={id} className="text-sm text-content cursor-pointer">{label}</label>
        {hint && <p className="text-xs text-subtle mt-0.5">{hint}</p>}
      </div>
      <input
        id={id}
        type="checkbox"
        role="switch"
        checked={checked}
        disabled={disabled}
        onChange={e => onChange(e.target.checked)}
        className="mt-0.5 shrink-0 w-4 h-4 accent-green-700 cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-green-600 rounded"
      />
    </div>
  )
}

function NumberField({
  id, label, hint, value, min, max, disabled, onChange,
}: {
  id: string
  label: string
  hint?: string
  value: number
  min: number
  max: number
  disabled?: boolean
  onChange: (v: number) => void
}) {
  return (
    <div className={disabled ? 'opacity-50' : ''}>
      <label htmlFor={id} className="block text-sm text-content mb-1">{label}</label>
      <input
        id={id}
        type="number"
        min={min}
        max={max}
        value={value}
        disabled={disabled}
        onChange={e => {
          const n = Number(e.target.value)
          if (Number.isFinite(n)) onChange(Math.min(max, Math.max(min, Math.round(n))))
        }}
        className="bg-card border border-line-strong h-9 rounded-lg px-3 w-24 text-sm text-content focus:outline-none focus:border-green-600"
      />
      {hint && <p className="text-xs text-subtle mt-1">{hint}</p>}
    </div>
  )
}

/**
 * Phone alerts (Web Push). Lives inside Reminders because push is a DELIVERY choice for the
 * same daily digest, not a separate feature. Permission is requested only from the button
 * (browsers ignore un-gestured prompts; iOS refuses them). On iPhone the button only works
 * inside the app opened from the Home Screen, so a Safari tab gets install steps instead.
 */
function PhoneAlerts({
  channel, disabled, onChannel,
}: {
  channel: 'email' | 'web'
  disabled: boolean
  onChannel: (v: 'email' | 'web') => void
}) {
  const supabase = createClient()
  const [status, setStatus] = useState<PushStatus>('unsupported')
  const [devices, setDevices] = useState<number | null>(null)
  const [busy, setBusy] = useState<'' | 'enable' | 'test'>('')
  const [msg, setMsg] = useState('')
  const [err, setErr] = useState('')

  async function countDevices() {
    const { count } = await supabase.from('push_subscriptions').select('id', { count: 'exact', head: true })
    setDevices(count ?? 0)
  }

  useEffect(() => {
    setStatus(pushStatus())
    void countDevices()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function enable() {
    setBusy('enable'); setErr(''); setMsg('')
    const problem = await enablePush()
    setStatus(pushStatus())
    await countDevices()
    setBusy('')
    if (problem) { setErr(problem); return }
    setMsg('This device will get reminders. “Phone notification” is selected below — tap Save reminders to keep it.')
    onChannel('web')
  }

  async function test() {
    setBusy('test'); setErr(''); setMsg('')
    try {
      const res = await fetch('/api/push/test', { method: 'POST' })
      const j = await res.json().catch(() => ({}))
      await countDevices()
      if (!res.ok || !j.ok) setErr(j.error ?? 'The test did not reach any device.')
      else setMsg(`Sent to ${j.sent} ${j.sent === 1 ? 'device' : 'devices'}. It should appear in a few seconds.`)
    } catch {
      setErr('Could not reach the server.')
    }
    setBusy('')
  }

  return (
    <fieldset disabled={disabled} className={`space-y-3 border-t border-line pt-4 ${disabled ? 'opacity-50' : ''}`}>
      <legend className="sr-only">How reminders reach you</legend>
      <p className="text-xs font-semibold text-subtle uppercase tracking-widest">How they reach you</p>

      <div className="space-y-2" role="radiogroup" aria-label="Delivery method">
        <label className="flex items-start gap-2 text-sm text-content cursor-pointer">
          <input type="radio" name="rem-channel" value="web" checked={channel === 'web'}
            onChange={() => onChannel('web')}
            className="mt-1 accent-green-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-green-600" />
          <span>Phone notification<span className="block text-xs text-subtle">Falls back to email if none of your devices can receive it.</span></span>
        </label>
        <label className="flex items-start gap-2 text-sm text-content cursor-pointer">
          <input type="radio" name="rem-channel" value="email" checked={channel === 'email'}
            onChange={() => onChannel('email')}
            className="mt-1 accent-green-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-green-600" />
          <span>Email</span>
        </label>
      </div>

      {status === 'ios-install' ? (
        <div className="text-xs text-subtle border border-line rounded-lg p-3 space-y-1">
          <p className="text-sm text-content">On iPhone, notifications only work from the installed app.</p>
          <p>Tap <strong>Share</strong> → <strong>Add to Home Screen</strong>, open Cultivate from the new icon, then come back here and turn on alerts.</p>
        </div>
      ) : status === 'unsupported' ? (
        <p className="text-xs text-subtle">This browser can&apos;t receive notifications. Open Cultivate on your phone to turn them on there.</p>
      ) : (
        <div className="flex flex-wrap items-center gap-3">
          <button type="button" onClick={enable} disabled={busy !== ''}
            className="px-4 py-1.5 bg-green-700 hover:bg-green-600 disabled:opacity-50 text-white text-sm font-medium rounded-lg transition-colors">
            {busy === 'enable' ? 'Turning on…' : status === 'granted' ? 'Re-register this device' : 'Turn on phone alerts'}
          </button>
          {(devices ?? 0) > 0 && (
            <button type="button" onClick={test} disabled={busy !== ''}
              className="px-4 py-1.5 border border-line-strong hover:border-green-600 disabled:opacity-50 text-content text-sm font-medium rounded-lg transition-colors">
              {busy === 'test' ? 'Sending…' : 'Send a test'}
            </button>
          )}
        </div>
      )}

      {devices !== null && (
        <p className="text-xs text-subtle">Registered devices: {devices}</p>
      )}
      {msg && <p role="status" className="text-xs text-green-600 dark:text-green-400">{msg}</p>}
      {err && <p role="alert" className="text-xs text-red-500">{err}</p>}
    </fieldset>
  )
}

export default function RemindersManager({
  initialPrefs,
  accountEmail,
  hasChildren,
}: {
  initialPrefs: ReminderPrefsRow
  accountEmail: string
  hasChildren: boolean
}) {
  const [p, setP] = useState<ReminderPrefsRow>(initialPrefs)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [saved, setSaved] = useState(false)
  const supabase = createClient()

  function set<K extends keyof ReminderPrefsRow>(k: K, v: ReminderPrefsRow[K]) {
    setP(prev => ({ ...prev, [k]: v }))
    setSaved(false)
  }

  async function save() {
    setBusy(true); setError(''); setSaved(false)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setError('Your session expired — please sign in again.'); setBusy(false); return }

    const destination = p.destination?.trim() || null
    const { error: err } = await supabase
      .from('notification_prefs')
      .upsert({ user_id: user.id, ...p, channel: p.channel === 'web' ? 'web' : 'email', destination }, { onConflict: 'user_id' })

    if (err) { setError(err.message); setBusy(false); return }
    setBusy(false); setSaved(true)
  }

  const off = !p.enabled

  return (
    <div className="space-y-5">
      <Toggle
        id="rem-enabled"
        label="Send me reminders"
        hint="One reminder a day at most, and only when something is actually due. Nothing due means nothing sent."
        checked={p.enabled}
        onChange={v => set('enabled', v)}
      />

      <PhoneAlerts
        channel={p.channel}
        disabled={off}
        onChannel={v => set('channel', v)}
      />

      <fieldset disabled={off} className="space-y-4 border-t border-line pt-4">
        <legend className="sr-only">Reminder sections</legend>
        <p className="text-xs font-semibold text-subtle uppercase tracking-widest">What to include</p>

        <Toggle
          id="rem-school"
          label="Homeschool logging"
          hint={hasChildren
            ? 'When your school log has gone quiet.'
            : 'Add a child to your account to use this.'}
          checked={p.school_enabled}
          disabled={off || !hasChildren}
          onChange={v => set('school_enabled', v)}
        />
        <Toggle
          id="rem-chores"
          label="Chores"
          hint="Recurring chores that are due or overdue."
          checked={p.chores_enabled}
          disabled={off}
          onChange={v => set('chores_enabled', v)}
        />
        <Toggle
          id="rem-equipment"
          label="Equipment servicing"
          hint="Scheduled maintenance that is due or overdue."
          checked={p.equipment_enabled}
          disabled={off}
          onChange={v => set('equipment_enabled', v)}
        />
      </fieldset>

      <fieldset disabled={off} className="space-y-4 border-t border-line pt-4">
        <legend className="sr-only">Delivery settings</legend>
        <p className="text-xs font-semibold text-subtle uppercase tracking-widest">When and where</p>

        <div>
          <label htmlFor="rem-hour" className="block text-sm text-content mb-1">Send at</label>
          <select
            id="rem-hour"
            value={p.send_hour_local}
            disabled={off}
            onChange={e => set('send_hour_local', Number(e.target.value))}
            className="bg-card border border-line-strong h-9 rounded-lg px-3 text-sm text-content focus:outline-none focus:border-green-600"
          >
            {Array.from({ length: 24 }, (_, h) => (
              <option key={h} value={h}>
                {h === 0 ? '12:00 AM' : h < 12 ? `${h}:00 AM` : h === 12 ? '12:00 PM' : `${h - 12}:00 PM`}
              </option>
            ))}
          </select>
          <p className="text-xs text-subtle mt-1">Central time.</p>
        </div>

        <div>
          <label htmlFor="rem-dest" className="block text-sm text-content mb-1">Send to</label>
          <input
            id="rem-dest"
            type="email"
            value={p.destination ?? ''}
            disabled={off}
            placeholder={accountEmail}
            onChange={e => set('destination', e.target.value)}
            className="bg-card border border-line-strong h-9 rounded-lg px-3 w-full max-w-sm text-sm text-content placeholder-subtle focus:outline-none focus:border-green-600"
          />
          <p className="text-xs text-subtle mt-1">Leave blank to use your account email.</p>
        </div>

        <Toggle
          id="rem-weekdays"
          label="School reminders on weekdays only"
          hint="A Saturday “you haven’t logged school” is usually noise."
          checked={p.school_weekdays_only}
          disabled={off || !p.school_enabled}
          onChange={v => set('school_weekdays_only', v)}
        />

        <div className="flex flex-wrap gap-6">
          <NumberField
            id="rem-stale"
            label="Nudge after"
            hint="Days without a school log."
            value={p.school_stale_days}
            min={1} max={30}
            disabled={off || !p.school_enabled}
            onChange={v => set('school_stale_days', v)}
          />
          <NumberField
            id="rem-renag"
            label="Repeat after"
            hint="Days before a still-overdue item is mentioned again."
            value={p.renag_days}
            min={1} max={30}
            onChange={v => set('renag_days', v)}
          />
        </div>
      </fieldset>

      <div className="flex items-center gap-3 border-t border-line pt-4">
        <button
          type="button"
          onClick={save}
          disabled={busy}
          className="px-4 py-1.5 bg-green-700 hover:bg-green-600 disabled:opacity-50 text-white text-sm font-medium rounded-lg transition-colors"
        >
          {busy ? 'Saving…' : 'Save reminders'}
        </button>
        {saved && <span role="status" className="text-xs text-green-600 dark:text-green-400">Saved.</span>}
        {error && <span role="alert" className="text-xs text-red-500">{error}</span>}
      </div>
    </div>
  )
}
