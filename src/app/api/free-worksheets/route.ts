import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

// The PUBLIC lead magnet. No auth, by design — this is the door a Pinterest pin or an Etsy
// PDF sends a stranger to, and Cultivate has no free tier for them to land in.
//
// Email is required to get the pack (that IS the freebie's job — the list is the compounding
// asset), but the download is instant: no confirm-your-email step, which loses half of them.
// A MailerLite failure never costs the visitor their download; we log it and hand over the zip.
//
// This route serves EXACTLY ONE object, hardcoded. It must never take a path or a resource id
// from the caller — the other four packs are the paid differentiator, and a public endpoint
// that signs an arbitrary key would hand them out for free.
const FREE_PACK = 'packs/prewriting.zip'
const ML_BASE = 'https://connect.mailerlite.com/api'

export async function POST(req: NextRequest) {
  let email = ''
  let source = ''
  try {
    const body = await req.json()
    email = (body.email || '').trim().toLowerCase()
    source = (body.source || 'free-worksheets').toString().trim().slice(0, 60)
  } catch {
    return NextResponse.json({ ok: false, error: 'Bad request' }, { status: 400 })
  }

  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    return NextResponse.json({ ok: false, error: 'Please enter a valid email.' }, { status: 400 })
  }

  // Mint the download FIRST. If storage is the thing that's broken, we say so plainly rather
  // than adding them to a list and then failing to deliver what we promised for the address.
  const admin = createAdminClient()
  const { data: signed, error: signErr } = await admin.storage
    .from('worksheets')
    .createSignedUrl(FREE_PACK, 120, { download: 'Cultivate-Pre-Writing-Practice.zip' })

  if (signErr || !signed?.signedUrl) {
    console.error('[free-worksheets] sign failed', signErr?.message)
    return NextResponse.json(
      { ok: false, error: 'The download isn’t available right now. Try again in a moment.' },
      { status: 500 }
    )
  }

  // Best-effort list write. Mirrors /api/lead: we never gate the value on it.
  // Worksheet leads get their OWN group + nurture (top-of-funnel preschool parents,
  // matched Etsy cross-sell) — distinct from the warmer state-requirement leads in /api/lead.
  // Falls back to the shared leads group if the worksheet var isn't set, so it can never
  // regress to a no-group write.
  const apiKey = process.env.MAILERLITE_API_KEY
  const groupId =
    process.env.MAILERLITE_WORKSHEET_GROUP_ID || process.env.MAILERLITE_LEADS_GROUP_ID
  if (apiKey) {
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
          fields: { lead_source: source },
          ...(groupId ? { groups: [groupId] } : {}),
        }),
      })
      if (!res.ok) {
        const detail = await res.text()
        console.error('[free-worksheets] MailerLite subscribe failed', res.status, detail.slice(0, 500))
      }
    } catch (e) {
      console.error('[free-worksheets] MailerLite request error', e)
    }
  } else {
    console.error('[free-worksheets] MAILERLITE_API_KEY not set — skipping list write')
  }

  return NextResponse.json({ ok: true, url: signed.signedUrl })
}
