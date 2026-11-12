import { createClient } from '@/lib/supabase/server'
import { PHOTO_BUCKET } from '@/lib/photoUrls'
import { NextResponse } from 'next/server'

// Serve a photo out of the now-PRIVATE `log-photos` bucket.
//
// The bucket was public until 2026-08-05, meaning every child photo was fetchable by anyone with
// the URL — no key, no session (RLS audit finding 2). It's private now, so stored `/object/public/`
// URLs no longer resolve and every render goes through here instead.
//
// ⭐ THE AUTHORIZATION IS DELIBERATELY NOT WRITTEN HERE. We sign with the CALLER'S OWN SESSION,
// never the admin client, because Supabase checks the storage SELECT policy before it will issue a
// signed URL. That policy is household-aware (20260805130000), so "who may see this photo" has
// exactly one definition, in the database, shared with the native client. Re-implementing the
// household check in this route would be a second copy free to drift out of sync with the first —
// which is the precise shape of the bug this audit was called to find.

const MAX_SIZE = 2400
// Short enough that a leaked URL dies quickly; long enough to paint a yearbook spread and let a
// user linger on a page without images expiring under them.
const TTL_SECONDS = 60 * 30

// Object keys are always `<user-uuid>/<filename>`. Reject anything else outright rather than
// handing user-controlled text to the storage API — no traversal, no absolute paths, no probing
// of other buckets.
const PATH_RE = /^[0-9a-fA-F-]{36}\/[A-Za-z0-9._-]{1,200}$/

export async function GET(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(request.url)
  const path = searchParams.get('p') ?? ''
  if (!PATH_RE.test(path)) {
    return NextResponse.json({ error: 'Bad photo reference' }, { status: 400 })
  }

  const wRaw = Number(searchParams.get('w'))
  const size = Number.isFinite(wRaw) && wRaw > 0 ? Math.min(Math.floor(wRaw), MAX_SIZE) : undefined

  // ⚠️ ALWAYS send width AND height together with resize:'contain'.
  //
  // Supabase's transform does NOT preserve aspect ratio when given `width` alone — its default
  // resize mode is 'cover', which sets the width and leaves the ORIGINAL height, squashing the
  // image. Measured on a real 1536x2048 log photo: `width=320` returned 320x2048 (ratio 0.156 vs
  // the true 0.75). With width+height+contain it returned 240x320 — correct, and 4.5x smaller.
  //
  // The pre-existing yearbook code passed width alone and got away with it only because its
  // width (1600) exceeded these images, so no resize happened at all. Any genuinely smaller
  // thumbnail would have been visibly distorted.
  //
  // Passing the same value for both makes `w` mean "longest side at most N", which is what every
  // call site actually wants.
  const transform = size ? { width: size, height: size, resize: 'contain' as const, quality: 75 } : undefined

  const { data, error } = await supabase.storage
    .from(PHOTO_BUCKET)
    .createSignedUrl(path, TTL_SECONDS, transform ? { transform } : undefined)

  // A storage-policy denial and a genuinely missing object both land here. Answer 404 for both:
  // distinguishing them would confirm to a prober that a given object exists.
  if (error || !data?.signedUrl) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  // Redirect rather than proxy the bytes — the image still comes from Supabase's CDN, so this
  // route stays cheap and never streams megabytes through the Next server.
  // `private` matters: the signed URL is per-user and must never land in a shared cache.
  return NextResponse.redirect(data.signedUrl, {
    status: 307,
    headers: { 'Cache-Control': `private, max-age=${TTL_SECONDS - 60}` },
  })
}
