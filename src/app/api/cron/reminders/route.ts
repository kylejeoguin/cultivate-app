import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { appToday } from '@/lib/date'
import { collectSnapshot } from '@/lib/notifications/collect'
import { decideReminders, type ReminderPrefs, type Weekday } from '@/lib/notifications/decide'
import { renderDigestEmail, sendDigestEmail } from '@/lib/notifications/email'
import { pushConfigured, renderDigestPush, sendToUser } from '@/lib/notifications/push'

/**
 * Daily reminder cron.
 *
 * Runs HOURLY and sends only to people whose `send_hour_local` matches the current
 * hour in the app's home timezone (America/Chicago — see src/lib/date.ts). One
 * schedule therefore serves every preferred send time without a per-user cron.
 *
 * NOBODY IS ENROLLED BY DEFAULT. `notification_prefs.enabled` defaults to false, so
 * this route is inert until a specific person opts in. That is the audience control
 * for v1 (Kyle only) and the permanent mechanism afterwards — there is no separate
 * allowlist to drift out of sync.
 *
 * DRY RUN: `?dry=1` performs the full decision pass and reports exactly what WOULD be
 * sent, without contacting Resend and without writing the ledger. Use it to inspect
 * real output before anything reaches an inbox.
 */

export const dynamic = 'force-dynamic'
export const maxDuration = 60
// web-push needs Node crypto — never Edge.
export const runtime = 'nodejs'

/** Current hour (0-23) and weekday in the app's home timezone. */
function centralNow(d = new Date()): { hour: number; weekday: Weekday } {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Chicago',
    hour: 'numeric',
    hour12: false,
    weekday: 'short',
  }).formatToParts(d)
  const hour = Number(parts.find(p => p.type === 'hour')?.value ?? '0')
  const wd = parts.find(p => p.type === 'weekday')?.value ?? 'Sun'
  const map: Record<string, Weekday> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 }
  return { hour: hour === 24 ? 0 : hour, weekday: map[wd] ?? 0 }
}

function authorized(req: Request): boolean {
  const secret = process.env.CRON_SECRET
  // Fail CLOSED. With no secret configured the route refuses rather than running
  // open to the internet — an endpoint that can email users must never be callable
  // by anyone who guesses the path.
  if (!secret) return false
  return req.headers.get('authorization') === `Bearer ${secret}`
}

export async function GET(req: Request) {
  if (!authorized(req)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  const dry = new URL(req.url).searchParams.get('dry') === '1'
  const admin = createAdminClient()
  const todayISO = appToday()
  const { hour, weekday } = centralNow()

  const { data: prefRows, error } = await admin
    .from('notification_prefs')
    .select('user_id, channel, destination, enabled, send_hour_local, school_weekdays_only, school_stale_days, renag_days, school_enabled, chores_enabled, equipment_enabled')
    .eq('enabled', true)
    .eq('send_hour_local', hour)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  const results: Array<Record<string, unknown>> = []

  for (const row of prefRows ?? []) {
    // Deliverable channels: 'web' (push, primary as of 2026-09-26, falls back to email)
    // and 'email'. 'apns' / 'fcm' stay storable but undeliverable.
    if (row.channel !== 'email' && row.channel !== 'web') {
      results.push({ user: row.user_id, skipped: `channel:${row.channel} not yet deliverable` })
      continue
    }

    const prefs: ReminderPrefs = {
      enabled: row.enabled,
      // Defaulted rather than assumed present: a row written before the section-toggle
      // migration has no value here, and silently treating that as `false` would mute
      // an already-enrolled person's reminders with no error anywhere.
      schoolEnabled: row.school_enabled ?? true,
      choresEnabled: row.chores_enabled ?? true,
      equipmentEnabled: row.equipment_enabled ?? true,
      schoolWeekdaysOnly: row.school_weekdays_only,
      schoolStaleDays: row.school_stale_days,
      renagDays: row.renag_days,
    }

    const snapshot = await collectSnapshot(admin, row.user_id, todayISO, weekday, prefs)
    const digest = decideReminders(snapshot)

    // The expected outcome on most days. Sending nothing is a success.
    if (!digest) {
      results.push({ user: row.user_id, sent: false, reason: 'nothing due' })
      continue
    }

    // Ledger + measurement, written ONLY after a confirmed delivery on `channel`.
    // Writing either after a failure would start the re-nag window for a reminder that
    // never arrived and silently swallow it.
    const recordSend = async (channel: 'web' | 'email', extra: Record<string, unknown> = {}) => {
      await admin.from('notification_sends').upsert(
        digest.items.map(i => ({
          user_id: row.user_id,
          item_type: i.type,
          item_key: i.key,
          sent_on: todayISO,
          channel,
        })),
        { onConflict: 'user_id,item_type,item_key,sent_on', ignoreDuplicates: true },
      )
      // The measurement record — does a nudge produce a day-2 return?
      await admin.from('events').insert({
        event_type: 'reminder_sent',
        source: 'cron',
        metadata: {
          user_id: row.user_id,
          channel,
          route: digest.route,
          item_types: digest.items.map(i => i.type),
          item_count: digest.items.length,
          ...extra,
        },
      })
    }

    // ── PUSH FIRST (channel 'web') ─────────────────────────────────────────────
    // Push is the primary channel (Kyle, 2026-09-26). If no device accepts it — none
    // registered, keys missing, or every device failed — fall through to email so the
    // reminder is never lost during the transition. Email goes away once push is proven.
    let fallbackReason: string | null = null
    if (row.channel === 'web') {
      const payload = renderDigestPush(digest, todayISO)

      if (dry) {
        const { count } = await admin
          .from('push_subscriptions')
          .select('id', { count: 'exact', head: true })
          .eq('user_id', row.user_id)
        results.push({
          user: row.user_id,
          channel: 'web',
          wouldPushTo: count ?? 0,
          pushConfigured: pushConfigured(),
          payload,
          items: digest.items.map(i => ({ type: i.type, key: i.key })),
          fallback: (count ?? 0) === 0 || !pushConfigured() ? 'email' : null,
        })
        continue
      }

      const r = await sendToUser(admin, row.user_id, payload)
      if (r.sent > 0) {
        await recordSend('web', { devices_sent: r.sent, devices_failed: r.failed, pruned: r.pruned })
        results.push({ user: row.user_id, channel: 'web', sent: true, devices: r.sent, failed: r.failed, pruned: r.pruned, items: digest.items.length })
        continue
      }
      fallbackReason = r.noDevices ? 'no devices registered' : `push failed on ${r.failed} device(s)`
    }

    let to = row.destination
    if (!to) {
      const { data: u } = await admin.auth.admin.getUserById(row.user_id)
      to = u?.user?.email ?? null
    }
    if (!to) {
      results.push({ user: row.user_id, sent: false, reason: 'no destination address' })
      continue
    }

    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://mycultivate.app'
    const rendered = renderDigestEmail(digest, appUrl)

    if (dry) {
      results.push({
        user: row.user_id,
        wouldSendTo: to,
        subject: rendered.subject,
        route: digest.route,
        items: digest.items.map(i => ({ type: i.type, key: i.key })),
        text: rendered.text,
      })
      continue
    }

    const ok = await sendDigestEmail(to, rendered)

    // ⚠️ Ledger ONLY on a confirmed send (see recordSend).
    if (ok) {
      await recordSend('email', fallbackReason ? { fallback_from: 'web', fallback_reason: fallbackReason } : {})
    }

    results.push({ user: row.user_id, channel: 'email', sent: ok, items: digest.items.length, ...(fallbackReason ? { fallbackReason } : {}) })
  }

  return NextResponse.json({ ok: true, dry, todayISO, hour, weekday, considered: prefRows?.length ?? 0, results })
}
