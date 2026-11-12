import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { sendAlert } from '@/lib/alert'

// Admin-only diagnostic: visit /api/alert-test while signed in as ADMIN_EMAIL to fire a
// test alert and confirm critical-error alerting is wired (Discord/email). Returns whether
// a destination is configured. Safe to keep — non-admins get 403.
export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user || user.email !== process.env.ADMIN_EMAIL) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 })
  }

  const configured =
    !!(process.env.RESEND_API_KEY && process.env.ALERT_EMAIL) || !!process.env.ALERT_WEBHOOK_URL

  await sendAlert('Test alert ✅', 'If you received this, critical-error alerting is wired and working. (Triggered from /api/alert-test)')

  return NextResponse.json({
    configured,
    via: process.env.RESEND_API_KEY && process.env.ALERT_EMAIL ? 'email' : process.env.ALERT_WEBHOOK_URL ? 'webhook' : 'none',
    message: configured
      ? 'Alert sent — check your inbox/channel.'
      : 'No alert destination configured. Set RESEND_API_KEY + ALERT_EMAIL (or ALERT_WEBHOOK_URL) in Vercel and redeploy.',
  })
}
