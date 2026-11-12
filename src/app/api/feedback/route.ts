import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

// In-app feedback capture. Auth-only. Stores the submission in public.feedback
// (RLS enforces the row belongs to the caller) and fires a best-effort email ping
// so Kyle sees it land. The email is fire-and-forget — it never blocks or fails the
// user's submit.

const TYPES = ['bug', 'idea', 'other'] as const
type FeedbackType = (typeof TYPES)[number]

export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let type: FeedbackType = 'other'
  let message = ''
  let pagePath = ''
  let userAgent = ''
  let viewport = ''
  try {
    const body = await request.json()
    type = (TYPES as readonly string[]).includes(body?.type) ? body.type : 'other'
    message = (body?.message ?? '').toString().trim().slice(0, 5000)
    pagePath = (body?.pagePath ?? '').toString().slice(0, 300)
    userAgent = (body?.userAgent ?? '').toString().slice(0, 500)
    viewport = (body?.viewport ?? '').toString().slice(0, 32)
  } catch {
    return NextResponse.json({ error: 'Bad request' }, { status: 400 })
  }

  if (!message) {
    return NextResponse.json({ error: 'Please enter a message.' }, { status: 400 })
  }

  const { error } = await supabase.from('feedback').insert({
    user_id: user.id,
    type,
    message,
    page_path: pagePath || null,
    user_agent: userAgent || null,
    viewport: viewport || null,
  })

  if (error) {
    console.error('[feedback] insert failed', error.message)
    return NextResponse.json(
      { error: 'Could not save your feedback. Please try again.' },
      { status: 500 },
    )
  }

  void notifyFeedback({ type, message, pagePath, email: user.email ?? 'unknown', userAgent, viewport })

  return NextResponse.json({ ok: true })
}

// Best-effort email ping (Resend HTTP API — same sender the app already uses in lib/alert.ts).
// Prefers ALERT_EMAIL (proven to reach Kyle); falls back to the public support inbox.
async function notifyFeedback(f: {
  type: FeedbackType
  message: string
  pagePath: string
  email: string
  userAgent: string
  viewport: string
}): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY
  const to = process.env.ALERT_EMAIL || 'hello@mycultivate.app'
  if (!apiKey) return

  const emoji = f.type === 'bug' ? '🐛' : f.type === 'idea' ? '💡' : '💬'
  const text =
    `From: ${f.email}\n` +
    `Type: ${f.type}\n` +
    `Page: ${f.pagePath || '—'}\n` +
    `Viewport: ${f.viewport || '—'}\n` +
    `Browser: ${f.userAgent || '—'}\n\n` +
    f.message

  try {
    const controller = new AbortController()
    const t = setTimeout(() => controller.abort(), 3000)
    await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        from: 'Cultivate Feedback <noreply@mycultivate.app>',
        to,
        ...(f.email !== 'unknown' ? { reply_to: f.email } : {}),
        subject: `${emoji} Cultivate feedback (${f.type})`,
        text,
      }),
      signal: controller.signal,
    }).finally(() => clearTimeout(t))
  } catch {
    // Email failing must never affect the user's submit.
  }
}
