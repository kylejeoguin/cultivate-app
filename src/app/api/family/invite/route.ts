import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { NextResponse } from 'next/server'
import { randomBytes } from 'crypto'

export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // Confirm user is on Family plan
  const { data: sub } = await supabase
    .from('subscriptions')
    .select('tier, status')
    .eq('user_id', user.id)
    .single()

  if (!sub || !['active', 'trialing'].includes(sub.status)) {
    return NextResponse.json({ error: 'No active subscription' }, { status: 403 })
  }
  if (sub.tier !== 'family') {
    return NextResponse.json({ error: 'Family plan required' }, { status: 403 })
  }

  // Check if they already have an accepted family member
  const admin = createAdminClient()
  const { data: existing } = await admin
    .from('family_members')
    .select('id, status, member_email')
    .eq('owner_id', user.id)
    .single()

  if (existing?.status === 'accepted') {
    return NextResponse.json({ error: 'Family member already added' }, { status: 400 })
  }

  const { email } = await request.json()
  if (!email || typeof email !== 'string') {
    return NextResponse.json({ error: 'Email required' }, { status: 400 })
  }

  if (email.toLowerCase() === user.email?.toLowerCase()) {
    return NextResponse.json({ error: 'Cannot invite yourself' }, { status: 400 })
  }

  const token = randomBytes(32).toString('hex')

  const { error } = await admin.from('family_members').upsert({
    owner_id: user.id,
    member_email: email.toLowerCase(),
    status: 'pending',
    invite_token: token,
    accepted_at: null,
    member_id: null,
  }, { onConflict: 'owner_id,member_email' })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const inviteUrl = `${process.env.NEXT_PUBLIC_APP_URL}/invite?token=${token}`

  // Send the invite email. Best-effort: if it fails, the owner still gets the
  // copyable link back to share manually, so a mail hiccup never blocks the invite.
  const emailed = await sendInviteEmail(email.toLowerCase(), user.email ?? '', inviteUrl)

  return NextResponse.json({ success: true, inviteUrl, emailed })
}

// Sends the family invite via Resend's HTTP API — same key + verified sender the
// app already uses for feedback (api/feedback) and alerts (lib/alert.ts).
async function sendInviteEmail(to: string, ownerEmail: string, inviteUrl: string): Promise<boolean> {
  const apiKey = process.env.RESEND_API_KEY
  if (!apiKey) return false

  const inviter = ownerEmail || 'your family member'
  const text =
    `${inviter} invited you to join their family account on Cultivate.\n\n` +
    `Cultivate is where your family tracks homeschool, homestead, and home projects in one place.\n\n` +
    `Accept the invite:\n${inviteUrl}\n\n` +
    `This link stops working once you accept it. If you weren't expecting this, you can ignore this email.`

  const html =
    `<div style="font-family:system-ui,-apple-system,Segoe UI,sans-serif;max-width:480px;margin:0 auto;color:#1c1917">` +
    `<p style="font-size:16px;line-height:1.5"><strong>${inviter}</strong> invited you to join their family account on Cultivate.</p>` +
    `<p style="font-size:14px;line-height:1.5;color:#57534e">Cultivate is where your family tracks homeschool, homestead, and home projects in one place.</p>` +
    `<p style="margin:28px 0"><a href="${inviteUrl}" style="background:#15803d;color:#fff;text-decoration:none;font-weight:600;font-size:15px;padding:12px 22px;border-radius:8px;display:inline-block">Accept invite</a></p>` +
    `<p style="font-size:12px;line-height:1.5;color:#78716c">Or paste this link into your browser:<br><a href="${inviteUrl}" style="color:#15803d;word-break:break-all">${inviteUrl}</a></p>` +
    `<p style="font-size:12px;line-height:1.5;color:#a8a29e">This link stops working once you accept it. If you weren't expecting this, you can ignore this email.</p>` +
    `</div>`

  try {
    const controller = new AbortController()
    const t = setTimeout(() => controller.abort(), 4000)
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        from: 'Cultivate <noreply@mycultivate.app>',
        to,
        ...(ownerEmail ? { reply_to: ownerEmail } : {}),
        subject: 'You’re invited to a Cultivate family account',
        text,
        html,
      }),
      signal: controller.signal,
    }).finally(() => clearTimeout(t))
    return res.ok
  } catch {
    return false
  }
}
