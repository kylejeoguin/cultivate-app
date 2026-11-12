import { createClient } from '@/lib/supabase/server'
import { householdOwnerId } from '@/lib/household'
import { NextResponse } from 'next/server'

// A "slot" is one editable photo position in the yearbook (cover hero, a child's spotlight
// photo, a letter photo, a collage tile…), identified by a stable slot_key. Saving a slot
// records the user's hand-picked photo; deleting it reverts that position to the system
// default. Auth-only; RLS enforces the row belongs to the caller.

// Only accept a photo the caller ACTUALLY OWNS — i.e. one already attached to one of their
// own daily logs or portfolio items. This is the real invariant (the picker only ever offers
// the user's own photos), and it's stronger than the old URL-shape check: it can't be spoofed
// with an arbitrary Supabase-storage URL, and it correctly accepts every legitimate photo
// (including non-storage-hosted ones) instead of silently rejecting them. RLS scopes both
// tables to the caller, so a match can only be the user's own row.
type ServerClient = Awaited<ReturnType<typeof createClient>>
async function userOwnsPhoto(supabase: ServerClient, url: string): Promise<boolean> {
  const { data: log } = await supabase
    .from('daily_log').select('id').contains('photo_urls', [url]).limit(1).maybeSingle()
  if (log) return true
  const { data: pf } = await supabase
    .from('portfolio_items').select('id').eq('file_url', url).limit(1).maybeSingle()
  if (pf) return true
  // Attributed / bulk-uploaded photos live in the photos table (may not be on any daily
  // log). The slot picker offers these, so ownership must accept them too. RLS scopes the
  // photos table to the caller, so a match can only be the user's own row.
  const { data: ph } = await supabase
    .from('photos').select('id').eq('url', url).limit(1).maybeSingle()
  return !!ph
}

export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let slotKey = ''
  let scope = ''
  let schoolYearId = ''
  let photoUrl = ''
  let childId: string | null = null
  try {
    const body = await request.json()
    slotKey = (body?.slotKey ?? '').toString().slice(0, 200)
    // `scope` identifies the book: a school_year_id for a year book, or "range:<start>:<end>"
    // for a custom range. schoolYearId (optional) still sets the FK column for year books.
    scope = (body?.scope ?? body?.schoolYearId ?? '').toString().slice(0, 300)
    schoolYearId = (body?.schoolYearId ?? '').toString()
    photoUrl = (body?.photoUrl ?? '').toString()
    const cid = (body?.childId ?? '').toString()
    childId = cid || null
  } catch {
    return NextResponse.json({ error: 'Bad request' }, { status: 400 })
  }
  if (!slotKey || !scope || !photoUrl) {
    return NextResponse.json({ error: 'Missing slot, scope, or photo.' }, { status: 400 })
  }
  if (photoUrl.length > 2048 || !(await userOwnsPhoto(supabase, photoUrl))) {
    return NextResponse.json({ error: 'That photo can’t be used here.' }, { status: 400 })
  }

  // If the slot is child-scoped, confirm the caller owns that child (RLS → null otherwise).
  if (childId) {
    const { data: child } = await supabase.from('children').select('id').eq('id', childId).maybeSingle()
    if (!child) return NextResponse.json({ error: 'Child not found.' }, { status: 404 })
  }

  const { error } = await supabase.from('yearbook_slots').upsert(
    {
      user_id: user.id,
      scope,
      school_year_id: schoolYearId || null, // null for custom-range books
      child_id: childId,
      slot_key: slotKey,
      photo_url: photoUrl,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'user_id,scope,slot_key' },
  )

  if (error) {
    console.error('[yearbook-slot] upsert failed', error.message)
    return NextResponse.json({ error: 'Could not save your photo choice. Please try again.' }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}

// Reset a slot back to the system default (removes the override row).
export async function DELETE(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let slotKey = ''
  let scope = ''
  try {
    const body = await request.json()
    slotKey = (body?.slotKey ?? '').toString().slice(0, 200)
    scope = (body?.scope ?? body?.schoolYearId ?? '').toString().slice(0, 300)
  } catch {
    return NextResponse.json({ error: 'Bad request' }, { status: 400 })
  }
  if (!slotKey || !scope) {
    return NextResponse.json({ error: 'Missing slot or scope.' }, { status: 400 })
  }

  // Household-scoped, not author-scoped — either parent may reset a slot (see lib/household.ts).
  const household = await householdOwnerId(supabase, user.id)
  const { error } = await supabase.from('yearbook_slots').delete()
    .eq('user_id', household).eq('scope', scope).eq('slot_key', slotKey)

  if (error) {
    console.error('[yearbook-slot] delete failed', error.message)
    return NextResponse.json({ error: 'Could not reset the photo. Please try again.' }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
