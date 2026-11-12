import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

// Saves a parent/guardian's yearbook message for one child + school year (the
// "Dear [Name]" letter — the one hand-written part of the keepsake, never AI-generated).
// Auth-only. RLS enforces the row belongs to the caller; we also confirm the child is
// the caller's own (children RLS makes a foreign child's select return null → 404).
export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let childId = ''
  let schoolYearId = ''
  let message = ''
  try {
    const body = await request.json()
    childId = (body?.childId ?? '').toString()
    schoolYearId = (body?.schoolYearId ?? '').toString()
    message = (body?.message ?? '').toString().slice(0, 5000)
  } catch {
    return NextResponse.json({ error: 'Bad request' }, { status: 400 })
  }
  if (!childId || !schoolYearId) {
    return NextResponse.json({ error: 'Missing child or school year.' }, { status: 400 })
  }

  // Ownership check — a child the caller doesn't own returns null under RLS.
  const { data: child } = await supabase.from('children').select('id').eq('id', childId).maybeSingle()
  if (!child) return NextResponse.json({ error: 'Child not found.' }, { status: 404 })

  const { error } = await supabase.from('yearbook_notes').upsert(
    {
      user_id: user.id,
      child_id: childId,
      school_year_id: schoolYearId,
      message,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'child_id,school_year_id' },
  )

  if (error) {
    console.error('[yearbook-note] upsert failed', error.message)
    return NextResponse.json({ error: 'Could not save your note. Please try again.' }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
