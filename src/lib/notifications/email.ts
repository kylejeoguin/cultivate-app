import 'server-only'
import type { DueItem, ReminderDigest } from './decide'

/**
 * THE EMAIL ADAPTER — one of several eventual delivery channels for the digest
 * produced by decide.ts. Nothing in here makes a judgement about WHETHER to send;
 * by the time anything here runs, that decision is already made.
 *
 * Email first, deliberately. Resend is already live and domain-verified for this app
 * (see src/lib/alert.ts), so this tests the actual open question — does a nudge bring
 * someone back on day 2? — with zero new infrastructure. Push is a delivery
 * optimisation on a behaviour we have not proven yet; there is no point optimising
 * the delivery of a message that may not work at all.
 *
 * Uses Resend's HTTP API via fetch rather than the `resend` npm package, matching the
 * existing convention in alert.ts and avoiding a dependency for one POST.
 */

const RESEND_ENDPOINT = 'https://api.resend.com/emails'
const FROM = 'Cultivate <noreply@mycultivate.app>'

function plural(n: number, one: string, many: string): string {
  return n === 1 ? one : many
}

/** "due today" / "2 days overdue" — plain language, no jargon, no colour-coding. */
function overdueLabel(days: number): string {
  if (days <= 0) return 'due today'
  return `${days} ${plural(days, 'day', 'days')} overdue`
}

export function lineFor(item: DueItem): string {
  switch (item.type) {
    case 'school_log':
      return item.lastLogDate === null
        ? 'No school day logged yet — the first one takes about two minutes.'
        : `School hasn't been logged in ${item.daysStale} ${plural(item.daysStale, 'day', 'days')}.`
    case 'chore':
      return `${item.name} — ${overdueLabel(item.daysOverdue)}.`
    case 'equipment_service':
      return `${item.equipmentName}: ${item.name} — ${overdueLabel(item.daysOverdue)}.`
  }
}

/**
 * Subject line. A single item names itself — a specific subject ("Furnace filter is
 * due") is read; a generic one ("You have updates") is not. Only a genuine multi-item
 * digest falls back to a count.
 */
export function subjectFor(items: DueItem[]): string {
  if (items.length === 1) {
    const only = items[0]
    if (only.type === 'school_log') return 'Two minutes: log the girls’ day'
    if (only.type === 'chore') return `${only.name} is ${overdueLabel(only.daysOverdue)}`
    return `${only.equipmentName}: ${only.name} is ${overdueLabel(only.daysOverdue)}`
  }
  return `${items.length} things due today`
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

export type RenderedEmail = { subject: string; text: string; html: string }

/**
 * Render the digest. Intentionally plain — this is a note from a tool the family
 * already uses, not a marketing email. No hero image, no branding banner, no
 * "we miss you". The whole message should be readable in a phone's notification
 * preview without opening it.
 */
export function renderDigestEmail(digest: ReminderDigest, appUrl: string): RenderedEmail {
  const { items, route } = digest
  const link = `${appUrl.replace(/\/$/, '')}${route}`
  const subject = subjectFor(items)
  const lines = items.map(lineFor)

  const text = [
    lines.join('\n'),
    '',
    `Open Cultivate: ${link}`,
    '',
    'To stop these, turn reminders off in Account settings.',
  ].join('\n')

  const html = [
    '<div style="font-family:system-ui,-apple-system,Segoe UI,sans-serif;font-size:16px;line-height:1.5;color:#1f2937">',
    '<ul style="padding-left:1.1em;margin:0 0 1.25em">',
    ...lines.map(l => `<li style="margin-bottom:.4em">${escapeHtml(l)}</li>`),
    '</ul>',
    `<p style="margin:0 0 1.5em"><a href="${escapeHtml(link)}" style="background:#166534;color:#fff;padding:.6em 1.1em;border-radius:6px;text-decoration:none;display:inline-block">Open Cultivate</a></p>`,
    '<p style="font-size:13px;color:#6b7280;margin:0">To stop these, turn reminders off in Account settings.</p>',
    '</div>',
  ].join('')

  return { subject, text, html }
}

/**
 * Send it. Returns true only on a confirmed 2xx from Resend.
 *
 * ⚠️ The caller MUST NOT write the send ledger unless this returns true. Writing the
 * ledger on a failed send would suppress the re-nag window and silently swallow the
 * reminder entirely — the failure mode would be invisible, which is the exact class
 * of bug this codebase keeps getting bitten by.
 */
export async function sendDigestEmail(to: string, email: RenderedEmail): Promise<boolean> {
  const apiKey = process.env.RESEND_API_KEY
  if (!apiKey) return false

  try {
    const controller = new AbortController()
    const t = setTimeout(() => controller.abort(), 10_000)
    const res = await fetch(RESEND_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        from: FROM,
        to,
        subject: email.subject,
        text: email.text,
        html: email.html,
      }),
      signal: controller.signal,
    }).finally(() => clearTimeout(t))
    return res.ok
  } catch {
    // Never throw out of a delivery adapter — a cron that dies partway through would
    // leave some recipients done and others not, with no record of which.
    return false
  }
}
