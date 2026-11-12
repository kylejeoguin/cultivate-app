import 'server-only'
import webpush from 'web-push'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { ReminderDigest } from './decide'
import { lineFor, subjectFor } from './email'

/**
 * Web Push delivery adapter — the `web` channel. Swappable, like email.ts: the decision
 * layer (decide.ts) never knows which adapter delivered its digest.
 *
 * Follows Lee's Supabase + Vercel guide (research/engineering/2026-09-25-web-push-supabase-vercel-LEE.md):
 * standard Web Push via `web-push` + ONE VAPID key pair, no Firebase. Node runtime only —
 * web-push needs Node crypto, so any route importing this must not run on Edge.
 */

export type PushPayload = {
  title: string
  body: string
  /** In-app ROUTE (e.g. /dashboard/log?focus=school). sw.js resolves it against its own origin. */
  route: string
  /** Same tag = a later push replaces the earlier notification instead of stacking. */
  tag: string
}

export type PushSubscriptionRow = {
  endpoint: string
  p256dh: string
  auth: string
}

export type PushResult = {
  /** Devices that accepted the push (2xx from the push service). */
  sent: number
  failed: number
  /** Endpoints the push service says are gone (404/410) — already deleted by sendToUser. */
  pruned: number
  /** No subscriptions at all for this person. */
  noDevices: boolean
}

let configured = false

/** True when VAPID keys are present. Without them nothing can be sent — callers fall back. */
export function pushConfigured(): boolean {
  const pub = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY
  const priv = process.env.VAPID_PRIVATE_KEY
  const subject = process.env.VAPID_SUBJECT
  if (!pub || !priv || !subject) return false
  if (!configured) {
    webpush.setVapidDetails(subject, pub, priv)
    configured = true
  }
  return true
}

/**
 * Digest → notification. Reuses the email wording (subjectFor / lineFor) so the two
 * channels can never drift apart while email is still the fallback.
 * Body stays short: lock screens show ~2 lines.
 */
export function renderDigestPush(digest: ReminderDigest, todayISO: string): PushPayload {
  const { items, route } = digest
  const title = subjectFor(items)
  const lines = items.map(lineFor)
  const body = items.length === 1
    ? lines[0]
    : lines.slice(0, 3).join('\n') + (items.length > 3 ? `\n+${items.length - 3} more` : '')
  return { title, body, route, tag: `reminders-${todayISO}` }
}

/**
 * Send one payload to every device a person has registered.
 *
 * - Never throws: a cron that dies partway leaves some people done and others not.
 * - Deletes subscriptions the push service reports as gone (404/410), or they accumulate
 *   and every future send pays for a guaranteed failure.
 * - `sent > 0` is the ONLY condition under which the caller may write the send ledger —
 *   same rule as email: a ledger row for a reminder that never arrived starts the re-nag
 *   window and silently swallows it.
 */
export async function sendToUser(
  admin: SupabaseClient,
  userId: string,
  payload: PushPayload,
): Promise<PushResult> {
  const { data: subs, error } = await admin
    .from('push_subscriptions')
    .select('endpoint, p256dh, auth')
    .eq('user_id', userId)

  if (error || !subs || subs.length === 0) {
    return { sent: 0, failed: 0, pruned: 0, noDevices: !error }
  }
  if (!pushConfigured()) {
    return { sent: 0, failed: subs.length, pruned: 0, noDevices: false }
  }

  const body = JSON.stringify(payload)
  let sent = 0
  let failed = 0
  const dead: string[] = []

  await Promise.all((subs as PushSubscriptionRow[]).map(async (s) => {
    try {
      await webpush.sendNotification(
        { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
        body,
        { TTL: 60 * 60 * 12, urgency: 'normal', timeout: 10_000 },
      )
      sent++
    } catch (err) {
      failed++
      const status = (err as { statusCode?: number })?.statusCode
      if (status === 404 || status === 410) dead.push(s.endpoint)
      else console.warn('[push] send failed', status, s.endpoint.slice(-16))
    }
  }))

  if (dead.length) {
    await admin.from('push_subscriptions').delete().in('endpoint', dead)
  }

  return { sent, failed, pruned: dead.length, noDevices: false }
}
