import 'server-only'

// Lightweight critical-error alerting for a solo founder. Wire it into the paths where a
// failure means a real user is hurting (a log that won't save, a Stripe webhook that won't
// write) so Kyle finds out — not the user.
//
// Two delivery options, whichever is configured (email preferred since Resend is already
// set up for this app):
//   1. EMAIL  — set RESEND_API_KEY + ALERT_EMAIL. Sends from noreply@mycultivate.app
//      (the domain already verified in Resend) to ALERT_EMAIL.
//   2. WEBHOOK — set ALERT_WEBHOOK_URL (a Discord/Slack incoming webhook).
//   3. Neither set -> silently no-ops (safe default; nothing breaks).
//
// Contract: this must NEVER throw and NEVER block the request meaningfully (3s timeout,
// errors swallowed). Call it fire-and-forget: `void sendAlert(...)`. See LAUNCH-RUNBOOK.md.
//
// `level` exists because not everything worth interrupting Kyle for is a failure. A new
// signup is the one GOOD event that deserves a push, and dressing it as 🔴 would train him
// to dread the sender — which is how a notification channel dies.
export async function sendAlert(
  title: string,
  detail?: string,
  level: 'alert' | 'notice' = 'alert',
): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY
  const alertEmail = process.env.ALERT_EMAIL
  const webhookUrl = process.env.ALERT_WEBHOOK_URL
  if (!alertEmail && !webhookUrl) return // nothing configured

  const icon = level === 'notice' ? '🌱' : '🔴'
  const word = level === 'notice' ? 'notice' : 'alert'
  const text = `Cultivate ${word} — ${title}${detail ? `\n\n${detail}` : ''}`

  try {
    const controller = new AbortController()
    const t = setTimeout(() => controller.abort(), 3000)

    if (apiKey && alertEmail) {
      // Email via Resend's HTTP API (separate from the Supabase Auth SMTP path).
      await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          from: 'Cultivate Alerts <noreply@mycultivate.app>',
          to: alertEmail,
          subject: `${icon} Cultivate: ${title}`,
          text,
        }),
        signal: controller.signal,
      }).finally(() => clearTimeout(t))
    } else if (webhookUrl) {
      const body = `${icon} **Cultivate** — ${title}${detail ? `\n${detail}` : ''}`
      await fetch(webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        // `content` is Discord's field; Slack uses `text` — send both so either works.
        body: JSON.stringify({ content: body, text: body }),
        signal: controller.signal,
      }).finally(() => clearTimeout(t))
    }
  } catch {
    // Alerting failing must never affect the user request or mask the original error.
  }
}
