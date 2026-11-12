import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')
  const invite = searchParams.get('invite') // preserve invite token through OAuth
  const next = searchParams.get('next') // post-exchange destination (e.g. password reset)

  if (code) {
    const supabase = await createClient()
    await supabase.auth.exchangeCodeForSession(code)
    // NOTE: MailerLite trial enrollment used to live here. It never once worked — the exchange
    // above needs the code_verifier from the browser that started signup, and confirmation
    // links are opened in the mail app, so it returned no user and the enrollment was skipped
    // silently. Enrollment now happens in the Stripe webhook on customer.subscription.created,
    // which is both guaranteed to run and the point at which a trial actually exists.
    // See src/lib/mailerlite.ts.
  }

  // If there's an invite token, send them back to the invite page to accept
  if (invite) {
    return NextResponse.redirect(`${origin}/invite?token=${invite}`)
  }

  // Honor an explicit post-exchange destination (only same-origin relative paths, to avoid
  // an open-redirect). Used by the password-reset flow to land on /reset-password/update.
  if (next && next.startsWith('/') && !next.startsWith('//')) {
    return NextResponse.redirect(`${origin}${next}`)
  }

  return NextResponse.redirect(`${origin}/dashboard`)
}
