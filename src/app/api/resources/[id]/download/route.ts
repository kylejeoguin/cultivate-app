import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getAccessInfo, canDownloadSubscriberResource } from '@/lib/access'
import { getCachedUser } from '@/lib/auth'

// The ONLY reader of the private `worksheets` bucket.
//
// Before this route existed, ResourcesClient rendered `<a href={resource.file_url}>` with no
// tier check at all — `tier` only picked which group a card sat in and whether an amber badge
// showed. RLS hands every authenticated user every active row, `file_url` included. So the
// moment a subscriber-tier row got a file, every trial user, every lapsed user, and (with a
// public bucket) every stranger with the URL had a working download. 184 of the 206 sheets are
// subscriber-tier: this was not an edge case.
//
// Now: authorize the USER against the ROW's tier, then mint a 60-second signed URL with the
// service role. The bucket has no storage policy, so nothing else can read it.

export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params

  // Service role reads the row: `file_url` is never sent to the browser (the page's select
  // omits it), and an inactive row must not be downloadable just because someone kept the id.
  const admin = createAdminClient()
  const { data: resource, error } = await admin
    .from('platform_resources')
    .select('id, tier, file_url, is_active')
    .eq('id', id)
    .maybeSingle()

  if (error) {
    console.error('[resources/download] lookup failed', error.message)
    return NextResponse.json({ error: 'Something went wrong. Try again in a moment.' }, { status: 500 })
  }
  if (!resource || !resource.is_active || !resource.file_url) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  // Every resource here lives behind the dashboard, so even a `free` row requires a signed-in
  // user. The PUBLIC lead magnet is a different door: /free-worksheets (no auth, email opt-in).
  //
  // getAccessInfo() returns 'none' for BOTH a signed-out visitor and a signed-in user who never
  // subscribed, so it can't distinguish 401 from 403 on its own. Ask who the user is directly.
  const [user, { reason }] = await Promise.all([getCachedUser(), getAccessInfo()])
  if (!user) {
    return NextResponse.json({ error: 'Sign in to download this.' }, { status: 401 })
  }
  if (resource.tier === 'subscriber' && !canDownloadSubscriberResource(reason)) {
    return NextResponse.json(
      { error: 'This is included with a Cultivate subscription.' },
      { status: 403 }
    )
  }

  // Short-lived on purpose: a copied URL dies in a minute, so a shared link isn't a bypass.
  const { data: signed, error: signErr } = await admin.storage
    .from('worksheets')
    .createSignedUrl(resource.file_url, 60, { download: true })

  if (signErr || !signed?.signedUrl) {
    console.error('[resources/download] sign failed', signErr?.message)
    return NextResponse.json({ error: 'That file isn’t available right now.' }, { status: 500 })
  }

  return NextResponse.redirect(signed.signedUrl, 302)
}
