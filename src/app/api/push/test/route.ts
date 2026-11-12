import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { pushConfigured, sendToUser } from '@/lib/notifications/push'

/**
 * "Send a test" — pushes a single notification to the CALLER's own devices only.
 *
 * Security boundary: the user comes from a server-side getUser() (fresh JWT validation),
 * never from the request body. There is no way to target anyone else from here — the
 * recipient is always the authenticated caller. (Lee's guide: the client may name the
 * event, never the recipient.)
 *
 * Node runtime: web-push needs Node crypto and does not run on Edge.
 */
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 20

export async function POST() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Sign in required' }, { status: 401 })

  if (!pushConfigured()) {
    return NextResponse.json({ error: 'Push is not configured on the server yet.' }, { status: 503 })
  }

  const result = await sendToUser(createAdminClient(), user.id, {
    title: 'Cultivate alerts are on',
    body: 'This is what a reminder will look like on this device.',
    route: '/dashboard/account#reminders',
    tag: 'test',
  })

  if (result.noDevices) {
    return NextResponse.json({ ...result, error: 'No devices are registered yet — tap “Turn on phone alerts” first.' }, { status: 409 })
  }
  return NextResponse.json({ ok: result.sent > 0, ...result })
}
