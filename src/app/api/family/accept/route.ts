import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { NextResponse } from 'next/server'

export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { token } = await request.json()
  if (!token) return NextResponse.json({ error: 'Token required' }, { status: 400 })

  const admin = createAdminClient()

  // Look up the invite
  const { data: invite, error: lookupError } = await admin
    .from('family_members')
    .select('*')
    .eq('invite_token', token)
    .eq('status', 'pending')
    .single()

  if (lookupError || !invite) {
    return NextResponse.json({ error: 'Invalid or expired invite' }, { status: 404 })
  }

  // Make sure the email matches
  if (invite.member_email !== user.email?.toLowerCase()) {
    return NextResponse.json({ error: 'This invite was sent to a different email address' }, { status: 403 })
  }

  // Make sure they're not already someone else's family member.
  // NOTE: this deliberately does NOT use .single(). PostgREST returns an ERROR (not rows) when
  // .single() matches 2+ rows, so the old `const { data } = ...single()` left `data` null and the
  // guard passed — it failed OPEN in exactly the case it existed to catch. Fetch up to 2 and count.
  // A DB-level partial unique index (20260727210000) now backstops this, but the route must still
  // fail CLOSED on a lookup error rather than letting an accept through unverified.
  const { data: existingMemberships, error: membershipError } = await admin
    .from('family_members')
    .select('id')
    .eq('member_id', user.id)
    .eq('status', 'accepted')
    .limit(2)

  if (membershipError) {
    return NextResponse.json({ error: 'Could not verify your family status. Please try again.' }, { status: 500 })
  }

  if (existingMemberships && existingMemberships.length > 0) {
    return NextResponse.json({ error: 'You are already part of a family account' }, { status: 400 })
  }

  // Make sure they aren't already PAYING for a plan of their own.
  // Without this, a user with their own active/trialing subscription can accept an invite and end
  // up billed for their own plan AND consuming a seat on the owner's family plan — a silent double
  // charge, plus their existing data stays stranded under an account they've stopped using.
  // `subscriptions` is one row per user (enforced by the `subscriptions_user_id_key` unique index,
  // same shape access.ts reads), so maybeSingle() cannot hit the multi-row error path.
  // The error IS still captured so this guard fails CLOSED: on any transient lookup failure `data`
  // comes back null, which would otherwise fall straight through the status check and let the
  // accept — and the double charge — go ahead. Same failure shape as the membership guard above.
  const { data: ownSub, error: ownSubError } = await admin
    .from('subscriptions')
    .select('status')
    .eq('user_id', user.id)
    .maybeSingle()

  if (ownSubError) {
    return NextResponse.json({ error: 'Could not verify your billing status. Please try again.' }, { status: 500 })
  }

  if (ownSub?.status === 'active' || ownSub?.status === 'trialing') {
    return NextResponse.json({
      error: 'You already have your own Cultivate plan. Accepting this invite would leave you paying for two subscriptions — cancel your plan in Account → Billing first, then open this invite again.',
    }, { status: 400 })
  }

  // Accept the invite
  const { error: updateError } = await admin
    .from('family_members')
    .update({
      member_id: user.id,
      status: 'accepted',
      accepted_at: new Date().toISOString(),
    })
    .eq('id', invite.id)

  if (updateError) return NextResponse.json({ error: updateError.message }, { status: 500 })

  return NextResponse.json({ success: true, owner_id: invite.owner_id })
}
