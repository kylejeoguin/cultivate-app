/**
 * Behaviour tests for the Web Push adapter.
 *
 * Run: npx tsx --require ./scripts/stub-server-only.cjs src/lib/notifications/push.test.ts
 *
 * Push failures are as invisible as email ones: a notification that silently never
 * arrives looks identical to "nothing was due". These pin the three properties the
 * cron depends on — wording parity with email, dead-subscription pruning, and that
 * `sent` only counts devices that actually accepted the push.
 */

import webpush from 'web-push'
import { renderDigestPush, sendToUser } from './push'
import { subjectFor } from './email'
import type { ReminderDigest } from './decide'

let passed = 0
const failures: string[] = []
function check(name: string, cond: boolean) {
  if (cond) passed++
  else failures.push(name)
}

// ── renderDigestPush ─────────────────────────────────────────────────────────
const one: ReminderDigest = {
  items: [{ type: 'chore', key: 'chore:1', name: 'Mow the grass', daysOverdue: 6 }] as ReminderDigest['items'],
  route: '/dashboard/chores',
}
const p1 = renderDigestPush(one, '2026-09-26')
check('single item: title matches the email subject', p1.title === subjectFor(one.items))
check('single item: route is the in-app route, not an absolute URL', p1.route === '/dashboard/chores')
check('tag is per-day so a re-send replaces rather than stacks', p1.tag === 'reminders-2026-09-26')

const five: ReminderDigest = {
  items: Array.from({ length: 5 }, (_, i) => ({ type: 'chore', key: `chore:${i}`, name: `Chore ${i}`, daysOverdue: i + 1 })) as ReminderDigest['items'],
  route: '/dashboard/chores',
}
const p5 = renderDigestPush(five, '2026-09-26')
check('five items: body shows 3 lines + "+2 more"', p5.body.split('\n').length === 4 && p5.body.endsWith('+2 more'))

// ── sendToUser (fake admin + stubbed web-push) ──────────────────────────────
process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY = 'BNcRdreALRFXTkOOUHK1EtK2wtaz5Ry4YfYCA_0QTpQtUbVlUls0VJXg7A8u-Ts1XbjhazAkj7I99e8QcYP7DkM'
process.env.VAPID_PRIVATE_KEY = 'x2kuhTADcW1tm7mUW3FFc1iWfBkpF_zGeKTL5VhMsTg'
process.env.VAPID_SUBJECT = 'mailto:test@cultivate.test'

type Sub = { endpoint: string; p256dh: string; auth: string }
function fakeAdmin(subs: Sub[]) {
  const deleted: string[] = []
  const admin = {
    from() {
      return {
        select() { return { eq: async () => ({ data: subs, error: null }) } },
        delete() { return { in: async (_c: string, eps: string[]) => { deleted.push(...eps); return { error: null } } } },
      }
    },
  }
  return { admin: admin as unknown as Parameters<typeof sendToUser>[0], deleted }
}

const outcomes: Record<string, number | null> = {}
;(webpush as unknown as { sendNotification: (s: { endpoint: string }) => Promise<unknown> }).sendNotification =
  async (s) => {
    const code = outcomes[s.endpoint]
    if (code === null || code === undefined) return { statusCode: 201 }
    throw Object.assign(new Error('push failed'), { statusCode: code })
  }

async function run() {
  // No devices → noDevices, nothing sent.
  {
    const { admin } = fakeAdmin([])
    const r = await sendToUser(admin, 'u1', p1)
    check('no devices: noDevices=true, sent=0', r.noDevices && r.sent === 0)
  }
  // Mixed: one ok, one gone (410), one transient (500).
  {
    const subs = [
      { endpoint: 'https://push/ok', p256dh: 'a', auth: 'b' },
      { endpoint: 'https://push/gone', p256dh: 'a', auth: 'b' },
      { endpoint: 'https://push/flaky', p256dh: 'a', auth: 'b' },
    ]
    outcomes['https://push/ok'] = null
    outcomes['https://push/gone'] = 410
    outcomes['https://push/flaky'] = 500
    const { admin, deleted } = fakeAdmin(subs)
    const r = await sendToUser(admin, 'u1', p1)
    check('mixed: sent counts only the accepted device', r.sent === 1)
    check('mixed: failed counts both failures', r.failed === 2)
    check('mixed: 410 endpoint is pruned', deleted.length === 1 && deleted[0] === 'https://push/gone')
    check('mixed: 500 endpoint is NOT pruned (transient)', !deleted.includes('https://push/flaky'))
  }
  // All failing → sent=0 so the cron falls back to email.
  {
    const subs = [{ endpoint: 'https://push/dead404', p256dh: 'a', auth: 'b' }]
    outcomes['https://push/dead404'] = 404
    const { admin, deleted } = fakeAdmin(subs)
    const r = await sendToUser(admin, 'u1', p1)
    check('all failed: sent=0 (cron must fall back to email)', r.sent === 0 && !r.noDevices)
    check('all failed: 404 endpoint pruned', deleted[0] === 'https://push/dead404')
  }

  console.log(`${passed} passed, ${failures.length} failed`)
  if (failures.length) {
    for (const f of failures) console.log('  FAIL:', f)
    process.exit(1)
  }
}
void run()
