import { NextRequest, NextResponse } from 'next/server'
import { createHash } from 'crypto'
import { anthropic, ROUTING_MODEL } from '@/lib/routeLog'
import { createAdminClient } from '@/lib/supabase/admin'
import { appToday } from '@/lib/date'
import { buildDemoTagPrompt, parseDemoTags } from '@/lib/demoTag'
import { sendAlert } from '@/lib/alert'
import * as Sentry from '@sentry/nextjs'

// PUBLIC endpoint (NO auth) powering the /try landing-page demo. It proxies a paid LLM to an
// UNAUTHENTICATED visitor, so it is guarded like a wallet:
//   1. hard input clamp (bounds token cost + shrinks the prompt-injection surface)
//   2. bot filter (known scrapers get a canned tag, never a model call)
//   3. per-IP AND global daily caps read BEFORE the model call (denial-of-wallet; the global
//      cap is the backstop against a botnet rotating IPs)
//   4. tiny max_tokens, output whitelisted to a fixed subject vocabulary (see lib/demoTag)
//   5. no DB write of visitor content, no identity stored, never leaks an error.
// Mirrors the /api/spark guard pattern, adapted from per-user to per-hashed-IP (no session here).

export const runtime = 'nodejs'
export const maxDuration = 15

const MAX_INPUT = 200
const PER_IP_DAILY_CAP = 5
// Env-tunable without a redeploy; NaN/0/unset all fall back to 500.
const GLOBAL_DAILY_CAP = Number(process.env.DEMO_TAG_GLOBAL_DAILY_CAP) || 500

const BOT_RE = /bot|crawl|spider|slurp|facebookexternalhit|facebot|embedly|preview|scan|monitor|headless|lighthouse|python-requests|curl|wget|axios|go-http/i

type Admin = ReturnType<typeof createAdminClient>

// Coarse client IP from Vercel's forwarding header, hashed + truncated — we never store or log
// a raw IP (matches the events table's "no IP, no identity" privacy posture).
function ipHash(req: NextRequest): string {
  const fwd = req.headers.get('x-forwarded-for') ?? ''
  const ip = fwd.split(',')[0]?.trim() || 'unknown'
  return createHash('sha256').update(ip).digest('hex').slice(0, 32)
}

async function readCount(admin: Admin, bucket: string, day: string): Promise<number> {
  const { data } = await admin
    .from('demo_usage')
    .select('count')
    .eq('bucket', bucket)
    .eq('usage_date', day)
    .maybeSingle()
  return (data?.count as number | undefined) ?? 0
}

// Alert Kyle the FIRST time the tagger breaks on a given day, then stay quiet. /try is paid
// traffic — a failing tagger burns real ad spend on a first impression of "it's broken" — but on
// 2026-06-12 this dependency threw 174 times in 24h, and 174 emails is not an alert, it's noise.
// The cooldown is stored in demo_usage (an ordinary counter row, distinct bucket) so it survives
// serverless cold starts; a module-level flag would reset with every new lambda instance.
// Known limit: one alert per calendar day — a second, separate outage the same day stays silent.
const ALERT_BUCKET = 'alert:demo_tag_error'

// Takes NO arguments that could throw. Everything it needs is built inside its own try: called
// from the catch block, an exception escaping this helper would convert our graceful 503 into an
// unhandled 500 and break the route's "never leak, always degrade" contract. (It did exactly that
// in testing when createAdminClient() was evaluated as an argument.)
async function alertOncePerDay(detail: string): Promise<void> {
  try {
    const admin = createAdminClient()
    const day = appToday()
    if (await readCount(admin, ALERT_BUCKET, day) > 0) return
    await bumpCount(admin, ALERT_BUCKET, day, 1)
    await sendAlert('Demo tagger failing on /try', detail)
  } catch {
    // Alerting must never turn a handled 503 into an unhandled crash.
  }
}

async function bumpCount(admin: Admin, bucket: string, day: string, next: number): Promise<void> {
  await admin
    .from('demo_usage')
    .upsert(
      { bucket, usage_date: day, count: next, updated_at: new Date().toISOString() },
      { onConflict: 'bucket,usage_date' },
    )
}

export async function POST(req: NextRequest) {
  try {
    // 1) Input clamp FIRST — strip control chars, collapse whitespace, trim, cap length. Bounds
    //    token cost and shrinks the injection surface before anything else touches the value.
    const body = await req.json().catch(() => ({} as Record<string, unknown>))
    const rawDesc = typeof body?.description === 'string' ? body.description : ''
    const description = rawDesc
      .replace(/[\x00-\x1f\x7f]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, MAX_INPUT)
    if (!description) {
      return NextResponse.json({ error: 'Type a sentence about your day first.' }, { status: 400 })
    }

    // 2) Bot filter — known scrapers get a canned tag, no model call, no counter spend.
    const ua = req.headers.get('user-agent') ?? ''
    if (BOT_RE.test(ua)) {
      return NextResponse.json({ subjects: ['Life Skills'], minutes: 30, homestead: null, sale: null, maintenance: null })
    }

    // 3) Rate limit BEFORE the LLM (denial-of-wallet). Per-IP cap + a global daily backstop.
    const admin = createAdminClient()
    const day = appToday()
    const ipBucket = `ip:${ipHash(req)}`
    const [ipUsed, globalUsed] = await Promise.all([
      readCount(admin, ipBucket, day),
      readCount(admin, 'global', day),
    ])
    if (ipUsed >= PER_IP_DAILY_CAP || globalUsed >= GLOBAL_DAILY_CAP) {
      return NextResponse.json(
        { error: "You've reached today's demo limit — start a free trial to log for real." },
        { status: 429 },
      )
    }

    // 4) The model call — lightweight, tag-only, tiny output.
    const message = await anthropic.messages.create({
      model: ROUTING_MODEL,
      max_tokens: 150,
      messages: [{ role: 'user', content: buildDemoTagPrompt(description) }],
    })
    const first = message.content[0]
    const text = first && first.type === 'text' ? first.text : '{}'
    const tags = parseDemoTags(text)

    // 5) Count the successful call in BOTH buckets. Increment-on-success only (atomic-enough at
    //    this scale, same as /api/spark — the tiny per-call cost makes a rare race harmless).
    await Promise.all([
      bumpCount(admin, ipBucket, day, ipUsed + 1),
      bumpCount(admin, 'global', day, globalUsed + 1),
    ])

    return NextResponse.json(tags)
  } catch (err) {
    // Log server-side but never leak the internal text — keep the demo graceful.
    // Sentry IS enabled in prod (NEXT_PUBLIC_SENTRY_DSN is set) but would NOT have seen this on
    // its own: it auto-reports UNhandled exceptions, and we handle this one. Without an explicit
    // capture (and with no captureConsole integration configured) a console.error goes nowhere.
    // So: capture for the stack trace + context, and email for the "you need to look now".
    console.error('[demo-tag] error:', err)
    Sentry.captureException(err, { tags: { route: 'demo-tag', surface: 'try-landing' } })
    void alertOncePerDay(
      `/api/demo-tag returned 503. Visitors on /try see "our tagger is catching its breath" instead ` +
      `of the demo — this is PAID ad traffic. Usual causes: Anthropic rate limit / outage / zero ` +
      `credit balance (check the console + that auto-reload's card is still good).\n\n${String(err)}`,
    )
    return NextResponse.json(
      { error: 'Our tagger is catching its breath — try again in a moment.' },
      { status: 503 },
    )
  }
}
