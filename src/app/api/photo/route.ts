import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { householdOwnerId } from '@/lib/household'
import { NextResponse } from 'next/server'

// Manage a single photos-table row (the per-child-attributed photos the log flow + bulk
// uploader write). Lets a user FINE-TUNE a photo after the fact: fix its date, edit the
// caption, re-tag who's in it, or delete it entirely. Auth-only; RLS scopes every row to the
// caller, and we also pin user_id on writes as belt-and-suspenders.

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

// Keep only child ids that actually belong to the caller — never store arbitrary uuids in
// child_ids (it's a plain array column with no FK). RLS scopes the children read to the user.
type ServerClient = Awaited<ReturnType<typeof createClient>>
async function ownChildIds(supabase: ServerClient, ids: string[]): Promise<string[]> {
  if (!ids.length) return []
  const { data } = await supabase.from('children').select('id').in('id', ids)
  const owned = new Set((data ?? []).map(c => c.id as string))
  return ids.filter(id => owned.has(id))
}

// Edit a photo: caption, date (taken_on), and/or who's in it (child_ids).
export async function PATCH(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let body: Record<string, unknown>
  try { body = await request.json() } catch { return NextResponse.json({ error: 'Bad request' }, { status: 400 }) }

  const id = (body?.id ?? '').toString()
  if (!id) return NextResponse.json({ error: 'Missing photo id.' }, { status: 400 })

  // Build the patch from ONLY the fields the client sent, so a caption-only edit can't wipe
  // the date, etc. Each is validated independently.
  const patch: Record<string, unknown> = {}
  if ('taken_on' in body) {
    const d = (body.taken_on ?? '').toString()
    if (!DATE_RE.test(d)) return NextResponse.json({ error: 'A photo needs a valid date.' }, { status: 400 })
    patch.taken_on = d
  }
  if ('caption' in body) {
    const c = (body.caption ?? '').toString().trim().slice(0, 500)
    patch.caption = c || null
  }
  if ('child_ids' in body) {
    const raw = Array.isArray(body.child_ids) ? body.child_ids.map(x => x?.toString()).filter(Boolean) as string[] : []
    patch.child_ids = await ownChildIds(supabase, raw)
  }

  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: 'Nothing to update.' }, { status: 400 })
  }

  // RLS restricts this to the caller's HOUSEHOLD; the user_id filter is defense-in-depth.
  // Pin the household id, not the caller's own id — an invited parent's rows are stored under
  // the plan owner (see lib/household.ts), so pinning user.id would match nothing for them.
  const household = await householdOwnerId(supabase, user.id)
  const { data, error } = await supabase
    .from('photos').update(patch).eq('id', id).eq('user_id', household).select('id').maybeSingle()
  if (error) {
    console.error('[photo] update failed', error.message)
    return NextResponse.json({ error: 'Could not save your changes. Please try again.' }, { status: 500 })
  }
  if (!data) return NextResponse.json({ error: 'Photo not found.' }, { status: 404 })
  return NextResponse.json({ ok: true })
}

// Delete a photo: removes the storage object AND the row. We look the row up under the user's
// session first (RLS → own only), delete the underlying storage file with the admin client
// (the bucket has no owner-delete policy), then delete the row. Storage-first so we never
// leave a row pointing at a missing file; a storage miss is non-fatal (delete the row anyway).
export async function DELETE(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let body: Record<string, unknown>
  try { body = await request.json() } catch { return NextResponse.json({ error: 'Bad request' }, { status: 400 }) }
  const id = (body?.id ?? '').toString()
  if (!id) return NextResponse.json({ error: 'Missing photo id.' }, { status: 400 })

  const household = await householdOwnerId(supabase, user.id)
  const { data: row } = await supabase
    .from('photos').select('id, url').eq('id', id).eq('user_id', household).maybeSingle()
  if (!row) return NextResponse.json({ error: 'Photo not found.' }, { status: 404 })

  // Remove the storage object (path = everything after the bucket segment). Best-effort.
  const marker = '/log-photos/'
  const at = row.url.indexOf(marker)
  if (at !== -1) {
    const path = row.url.slice(at + marker.length)
    try {
      const admin = createAdminClient()
      await admin.storage.from('log-photos').remove([path])
    } catch (e) {
      console.error('[photo] storage remove failed (continuing to delete row)', e)
    }
  }

  const { error } = await supabase.from('photos').delete().eq('id', id).eq('user_id', household)
  if (error) {
    console.error('[photo] row delete failed', error.message)
    return NextResponse.json({ error: 'Could not delete the photo. Please try again.' }, { status: 500 })
  }

  // The same file also lives in daily_log.photo_urls — the log flow writes BOTH the photos-table
  // row (attribution) and the log's photo_urls array (the legacy copy). We just deleted the row
  // and the storage object, but the daily_log copies would remain as dead links: the yearbook
  // falls back to daily_log.photo_urls for any URL the photos table no longer owns, so it would
  // re-surface this now-404 URL and paint a blank/broken tile in the SAME layout slot — the
  // "deleted photo leaves a hole, layout doesn't re-flow" bug. Strip the URL from every log row
  // that references it (a photo can be attached to more than one entry) so the photo is truly
  // gone and the collage recomputes without it. RLS scopes daily_log to the caller; best-effort
  // (the authoritative row + file are already gone, so a hiccup here must not fail the delete).
  try {
    const { data: logRows } = await supabase
      .from('daily_log').select('id, photo_urls').contains('photo_urls', [row.url])
    for (const r of logRows ?? []) {
      const next = ((r.photo_urls as string[] | null) ?? []).filter(u => u !== row.url)
      await supabase.from('daily_log').update({ photo_urls: next }).eq('id', r.id)
    }
  } catch (e) {
    console.error('[photo] daily_log url cleanup failed (photo row + file already removed)', e)
  }

  return NextResponse.json({ ok: true })
}
