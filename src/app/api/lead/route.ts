import { NextRequest, NextResponse } from 'next/server'
import { STATE_BY_ABBR } from '@/lib/stateCompliance'

// Lead capture for the public /state-requirements front door.
// Subscribes the email to MailerLite (new "connect" API), tagged with the state
// (built-in standard field) and the acquisition channel (lead_source custom field)
// so the 30-day channel test can read email-capture volume per channel.
// Resilient by design: a MailerLite failure still returns ok:true so the visitor
// always gets their checklist — we never gate the value on the list write.

const ML_BASE = 'https://connect.mailerlite.com/api'

export async function POST(req: NextRequest) {
  let email = ''
  let stateAbbr = ''
  let source = ''
  try {
    const body = await req.json()
    email = (body.email || '').trim().toLowerCase()
    stateAbbr = (body.state || '').trim().toUpperCase()
    source = (body.source || 'direct').toString().trim().slice(0, 60)
  } catch {
    return NextResponse.json({ ok: false, error: 'Bad request' }, { status: 400 })
  }

  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    return NextResponse.json({ ok: false, error: 'Please enter a valid email.' }, { status: 400 })
  }

  const stateName = STATE_BY_ABBR[stateAbbr]?.name ?? null
  const apiKey = process.env.MAILERLITE_API_KEY
  const groupId = process.env.MAILERLITE_LEADS_GROUP_ID

  if (apiKey) {
    try {
      const fields: Record<string, string> = { lead_source: source }
      if (stateName) fields.state = stateName // MailerLite built-in standard field

      const res = await fetch(`${ML_BASE}/subscribers`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify({
          email,
          fields,
          ...(groupId ? { groups: [groupId] } : {}),
        }),
      })
      if (!res.ok) {
        const detail = await res.text()
        console.error('[lead] MailerLite subscribe failed', res.status, detail.slice(0, 500))
      }
    } catch (e) {
      console.error('[lead] MailerLite request error', e)
    }
  } else {
    console.error('[lead] MAILERLITE_API_KEY not set — skipping list write')
  }

  // Always succeed for the visitor — the PDF is theirs regardless of the list write.
  return NextResponse.json({ ok: true })
}
