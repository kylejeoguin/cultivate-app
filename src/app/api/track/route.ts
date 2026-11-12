import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

// First-party landing tracker. The client beacon POSTs one call per session-landing; we
// enrich it with server-only signals (coarse country + device + bot flag from headers) and
// insert into public.events. Attribution only — no IP, no UA string, no identity is stored.
//
// Resilient by contract (BUILD-BIBLE Dim 4): analytics must NEVER take down the core path or
// surface an error to the visitor. Every failure path still returns ok — we'd rather lose a
// data point than break a page load.

export const runtime = 'nodejs'
export const maxDuration = 5

const clamp = (v: unknown, max: number): string | null => {
  if (typeof v !== 'string') return null
  const t = v.trim()
  return t ? t.slice(0, max) : null
}

function deviceClass(ua: string): 'mobile' | 'tablet' | 'desktop' {
  const s = ua.toLowerCase()
  if (/ipad|tablet|playbook|silk|(android(?!.*mobile))/.test(s)) return 'tablet'
  if (/mobi|iphone|ipod|android.*mobile|blackberry|iemobile|opera mini/.test(s)) return 'mobile'
  return 'desktop'
}

// The known automated agents we want to EXCLUDE from "clicks" — most notably
// facebookexternalhit (the FB/IG link-preview scraper) which hits every shared URL.
// Includes MAIL-CLIENT link scanners (added 2026-08-02). These are the likely cause of the
// observed "duplicate" hits: two rows at an identical timestamp with DIFFERENT session_ids and
// different device classes. That is not a client double-fire — a second, non-browser agent
// fetched the same URL. GoogleImageProxy in particular pre-fetches links in Gmail, which is
// exactly the path a confirm-email click takes to /login.
const BOT_RE = /bot|crawl|spider|slurp|facebookexternalhit|facebot|embedly|quora link preview|whatsapp|telegrambot|pinterest|preview|scan|monitor|headless|lighthouse|python-requests|curl|wget|axios|go-http|googleimageproxy|google-read-aloud|via ggpht|mail\.ru|yahoomailproxy|outlook|microsoft office|skypeuripreview|proofpoint|barracuda|mimecast|urldefense/i

export async function POST(req: NextRequest) {
  try {
    let body: Record<string, unknown> = {}
    try {
      body = await req.json()
    } catch {
      return NextResponse.json({ ok: true }) // malformed — ignore, never error
    }

    const ua = req.headers.get('user-agent') ?? ''
    const country = req.headers.get('x-vercel-ip-country') // Vercel edge geo; null in local dev

    const row = {
      event_type: clamp(body.event_type, 50) ?? 'visit',
      session_id: clamp(body.session_id, 100),
      path: clamp(body.path, 1024),
      source: clamp(body.source, 200),
      utm_source: clamp(body.utm_source, 200),
      utm_medium: clamp(body.utm_medium, 200),
      utm_campaign: clamp(body.utm_campaign, 200),
      utm_content: clamp(body.utm_content, 200),
      utm_term: clamp(body.utm_term, 200),
      query: clamp(body.query, 2048),
      referrer_host: clamp(body.referrer_host, 255),
      country: country ? country.slice(0, 8) : null,
      device: deviceClass(ua),
      is_bot: BOT_RE.test(ua),
      metadata: body.metadata && typeof body.metadata === 'object' ? body.metadata : {},
    }

    const supabase = await createClient()
    const { error } = await supabase.from('events').insert(row)
    if (error) console.error('[track] insert failed', error.message)
  } catch (e) {
    console.error('[track] unexpected', e)
  }

  // Always succeed — a tracking failure is invisible to the visitor.
  return NextResponse.json({ ok: true })
}
