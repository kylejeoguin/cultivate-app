import { NextRequest, NextResponse } from 'next/server'
import { sendAlert } from '@/lib/alert'
import { createClient } from '@/lib/supabase/server'
import { routeLogDescription, type RouteLogResponse } from '@/lib/routeLog'

// The routing logic itself lives in `@/lib/routeLog` so it can be exercised by the
// messy-input corpus (scripts/stress-corpus.ts) without an HTTP request or a session.
// This handler owns only auth, request parsing, and status codes.
// Re-exported for the confirm card, which has long imported the types from here.
export type { RoutingResult, RouteLogResponse } from '@/lib/routeLog'

export async function POST(req: NextRequest) {
  try {
    // Auth guard: this endpoint proxies a paid LLM — require a signed-in user (denial-of-wallet protection).
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { description, children, subjects, projects, chores } = await req.json()

    if (!description?.trim()) {
      return NextResponse.json({ error: 'Description is required' }, { status: 400 })
    }

    const outcome = await routeLogDescription({ description, children, subjects, projects, chores })
    if (!outcome.ok) {
      return NextResponse.json({ error: outcome.error }, { status: outcome.status })
    }

    const response: RouteLogResponse = { events: outcome.events }
    return NextResponse.json(response)

  } catch (err) {
    // AI at capacity (429 rate-limit / 529 overloaded) even after SDK retries: the user's
    // text is untouched on the client, so ask them to retry in a moment rather than 500-ing
    // and making them think their entry was lost.
    const status = (err as { status?: number })?.status
    const rateLimited = status === 429 || status === 529 ||
      (err instanceof Error && /rate.?limit|overloaded/i.test(err.message))
    if (rateLimited) {
      console.warn('[route-log] AI rate-limited after retries (status', status, ')')
      return NextResponse.json(
        { error: 'Our AI is briefly at capacity. Give it a few seconds and tap Review again — your entry is safe.' },
        { status: 503 }
      )
    }
    console.error('[route-log] error:', err)
    // A genuine route-log failure = a user can't log (the app's primary function). Alert.
    void sendAlert('route-log failed (a user could not save a log)', err instanceof Error ? err.message : String(err))
    // Don't leak internal error text to the client — log/alert it server-side, return a generic message.
    // Nothing has been SAVED at this point: this endpoint only reads the text into events, and the
    // user hasn't hit Confirm yet. Saying "saving" here makes people think they lost their day.
    return NextResponse.json(
      { error: 'We couldn’t read that into events just now. Nothing was saved or lost — your text is still here. Try again in a moment.' },
      { status: 500 }
    )
  }
}
