'use client'

import { createClient } from '@/lib/supabase/client'

/**
 * Browser side of Web Push. ONE module owns the subscription lifecycle
 * (Lee's guide: research/engineering/2026-09-25-web-push-supabase-vercel-LEE.md).
 *
 *   enablePush()  — from a BUTTON only. Browsers ignore un-gestured permission prompts and
 *                   iOS refuses them outright. Permission is one-shot: a "Don't Allow" can never
 *                   be re-prompted from code.
 *   refreshPush() — silently on app load while signed in. Subscriptions rotate; this keeps the
 *                   row current and never prompts.
 *   disablePush() — BEFORE signOut, so a shared or loaned device goes quiet.
 *
 * iPhone only delivers web push to an app INSTALLED to the Home Screen (iOS 16.4+), and only
 * when permission was requested from inside that installed app — hence 'ios-install'.
 */

const PUB = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? ''
const ENDPOINT_KEY = 'cultivate_push_endpoint'

export type PushStatus = 'granted' | 'denied' | 'default' | 'unsupported' | 'ios-install'

function toKey(b64: string): Uint8Array<ArrayBuffer> {
  const s = atob(b64.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(b64.length / 4) * 4, '='))
  const out = new Uint8Array(new ArrayBuffer(s.length))
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i)
  return out
}

function fromKey(buf: ArrayBuffer | null): string {
  if (!buf) return ''
  return btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

export function isIOS(): boolean {
  if (typeof navigator === 'undefined') return false
  return /iPhone|iPad|iPod/i.test(navigator.userAgent) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
}

export function isStandalone(): boolean {
  if (typeof window === 'undefined') return false
  return window.matchMedia?.('(display-mode: standalone)').matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
}

export function pushStatus(): PushStatus {
  if (typeof window === 'undefined') return 'unsupported'
  if (!('Notification' in window) || !('PushManager' in window) || !('serviceWorker' in navigator)) {
    return isIOS() && !isStandalone() ? 'ios-install' : 'unsupported'
  }
  if (!PUB) return 'unsupported'
  return Notification.permission as PushStatus
}

async function getSubscription(prompt: boolean): Promise<PushSubscription | null> {
  const reg = await navigator.serviceWorker.register('/sw.js')
  await navigator.serviceWorker.ready
  let sub = await reg.pushManager.getSubscription()

  // A subscription made with a DIFFERENT key (old deploy, rotated key) blocks new ones
  // and makes every send fail. Drop it and make a fresh one.
  if (sub && sub.options?.applicationServerKey && fromKey(sub.options.applicationServerKey) !== PUB) {
    await sub.unsubscribe()
    sub = null
  }

  if (!sub) {
    if (Notification.permission !== 'granted') {
      if (!prompt) return null
      if ((await Notification.requestPermission()) !== 'granted') return null
    }
    sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: toKey(PUB) })
  }
  return sub
}

/** Upsert this device's row. Returns an error message, or null on success. */
async function save(sub: PushSubscription): Promise<string | null> {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return 'Your session expired — please sign in again.'
  const j = sub.toJSON()
  if (!j.endpoint || !j.keys?.p256dh || !j.keys?.auth) return 'This browser returned an incomplete subscription.'

  const { error } = await supabase.from('push_subscriptions').upsert({
    user_id: user.id,
    endpoint: j.endpoint,
    p256dh: j.keys.p256dh,
    auth: j.keys.auth,
    platform: isIOS() ? 'ios-pwa' : /Android/i.test(navigator.userAgent) ? 'android' : 'web',
    user_agent: navigator.userAgent.slice(0, 300),
    last_seen_at: new Date().toISOString(),
  }, { onConflict: 'endpoint' })

  // ⚠️ Check the result. "Permission granted but no row" was the #1 silent failure in
  // Lee's build — RLS denial or a not-yet-loaded user looks exactly like success otherwise.
  if (error) return error.message
  try { localStorage.setItem(ENDPOINT_KEY, j.endpoint) } catch { /* storage can be blocked */ }
  return null
}

/** Button handler. Returns null on success or a human-readable reason on failure. */
export async function enablePush(): Promise<string | null> {
  const status = pushStatus()
  if (status === 'ios-install') return 'On iPhone, add Cultivate to your Home Screen first, then open it from the icon.'
  if (status === 'unsupported') return 'This browser does not support notifications.'
  if (status === 'denied') return 'Notifications are blocked for Cultivate. Turn them on in your phone or browser settings, then try again.'
  try {
    const sub = await getSubscription(true)
    if (!sub) return 'Notifications were not allowed.'
    return await save(sub)
  } catch (e) {
    return e instanceof Error ? e.message : 'Could not turn on notifications.'
  }
}

/** Silent refresh on app load. Never prompts, never throws. */
export async function refreshPush(): Promise<void> {
  try {
    if (pushStatus() !== 'granted') return
    const sub = await getSubscription(false)
    if (sub) await save(sub)
  } catch { /* best-effort */ }
}

/** Call BEFORE supabase.auth.signOut(). Never throws — sign-out must always proceed. */
export async function disablePush(): Promise<void> {
  try {
    let endpoint: string | null = null
    try { endpoint = localStorage.getItem(ENDPOINT_KEY) } catch { /* ignore */ }
    if (!endpoint && 'serviceWorker' in navigator) {
      const reg = await navigator.serviceWorker.getRegistration('/sw.js')
      endpoint = (await reg?.pushManager.getSubscription())?.endpoint ?? null
    }
    if (endpoint) {
      await createClient().from('push_subscriptions').delete().eq('endpoint', endpoint)
    }
    try { localStorage.removeItem(ENDPOINT_KEY) } catch { /* ignore */ }
  } catch { /* best-effort */ }
}
