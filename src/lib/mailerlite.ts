import 'server-only'
import { sendAlert } from '@/lib/alert'

// ONE place that puts a real trial user onto the MailerLite trial sequence.
//
// ★ WHY THIS EXISTS (found 2026-07-25): enrollment used to live in /auth/callback, behind the
// PKCE `exchangeCodeForSession`. That exchange needs the code_verifier from the browser that
// STARTED signup — but the confirmation link is opened in the mail app, a different storage
// context. So the exchange returned no user, this block was skipped, and the user got bounced
// to /login. Net effect: the 8-email trial sequence sent ZERO emails to ANYONE for its entire
// life (5 real trials, 0 enrolled). Nobody noticed because the failure only wrote console.error
// and Sentry reports unhandled exceptions only.
//
// ★ THE RULE: enroll from the Stripe webhook, at the moment a trial actually EXISTS. That path
// is guaranteed to run (Stripe retries it), and it's semantically right — this is a *trial*
// sequence, and at email-confirm time no trial exists yet (checkout hasn't happened).
//
// Idempotent by construction: MailerLite's POST /subscribers upserts on email and merges groups,
// so a Stripe retry re-sending the same event cannot create a duplicate or double-start the flow.

const ML_BASE = 'https://connect.mailerlite.com/api'

export type EnrollResult = 'enrolled' | 'skipped_no_config' | 'failed'

/**
 * Add a trialing user to the MailerLite trial group, which triggers the trial automation.
 *
 * Never throws — billing must not depend on the email vendor being up. A failure alerts Kyle
 * (loudly, by design) and returns 'failed' so the caller can decide; it must NOT fail the
 * Stripe webhook, or a MailerLite outage would stall subscription writes.
 */
export async function enrollTrialUser(email: string, name?: string | null): Promise<EnrollResult> {
  const apiKey = process.env.MAILERLITE_API_KEY
  const groupId = process.env.MAILERLITE_TRIAL_GROUP_ID

  if (!apiKey || !groupId) {
    console.error('[mailerlite] MAILERLITE_API_KEY or MAILERLITE_TRIAL_GROUP_ID not set — trial enrollment skipped')
    void sendAlert(
      'MailerLite trial enrollment skipped',
      `Missing config (api key: ${apiKey ? 'set' : 'MISSING'}, group id: ${groupId ? 'set' : 'MISSING'}). ${email} did not enter the trial sequence.`
    )
    return 'skipped_no_config'
  }

  try {
    const res = await fetch(`${ML_BASE}/subscribers`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({
        email,
        fields: { name: name ?? '' },
        groups: [groupId],
        resubscribe: false,
      }),
    })

    // The old call site never checked this, so a 4xx looked identical to success.
    if (!res.ok) {
      const detail = await res.text()
      console.error('[mailerlite] trial enrollment failed', res.status, detail.slice(0, 500))
      void sendAlert(
        'MailerLite trial enrollment FAILED',
        `${email} is trialing but did NOT enter the trial sequence.\nHTTP ${res.status}\n${detail.slice(0, 500)}`
      )
      return 'failed'
    }

    // Log WHICH group we wrote to. A wrong-but-valid group id is the one failure mode that
    // still returns 200 here — it would enroll the user into a group no automation listens to,
    // i.e. silently dead again. The expected trial group is ...982194; if this line ever shows
    // something else, that is the bug.
    console.info(`[mailerlite] enrolled ${email} in trial sequence (group …${groupId.slice(-6)})`)
    return 'enrolled'
  } catch (e) {
    console.error('[mailerlite] trial enrollment request error', e)
    void sendAlert(
      'MailerLite trial enrollment FAILED',
      `${email} is trialing but did NOT enter the trial sequence.\n${e instanceof Error ? e.message : String(e)}`
    )
    return 'failed'
  }
}
