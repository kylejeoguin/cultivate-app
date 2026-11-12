import { createClient } from '@/lib/supabase/server'
import { type EmailOtpType } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'

// Email-link verification via token_hash + verifyOtp (NOT the PKCE ?code= exchange used by
// /auth/callback for OAuth). verifyOtp establishes the session server-side from the token alone —
// it needs NO browser-bound code_verifier cookie, so a recovery / confirmation link works even when
// opened in a different browser than the one that requested it (e.g. requested on desktop, opened in
// the Yahoo mail app's in-app browser). That cross-browser case is exactly what silently failed before
// (the verifier only lives in the requesting browser), making valid links read as "expired".
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url)
  const token_hash = searchParams.get('token_hash')
  const type = searchParams.get('type') as EmailOtpType | null
  const code = searchParams.get('code')
  const next = searchParams.get('next')

  // Only honor same-origin relative destinations (no open-redirect).
  const safeNext = next && next.startsWith('/') && !next.startsWith('//') ? next : '/dashboard'

  if (token_hash && type) {
    const supabase = await createClient()
    const { error } = await supabase.auth.verifyOtp({ type, token_hash })
    if (!error) {
      // Session cookies are set on this redirect response; the destination page sees the user.
      return NextResponse.redirect(`${origin}${safeNext}`)
    }
    console.error('verifyOtp failed:', error.message)
  } else if (code) {
    // PKCE fallback. An email template still using {{ .ConfirmationURL }} routes through
    // Supabase's /verify and arrives here with ?code= instead of ?token_hash=. Handling it
    // means the code change and the template change can ship in EITHER order without a
    // broken window: same-browser opens keep working exactly as they did before.
    //
    // Cross-browser opens still fail here (the code_verifier lives in the requesting
    // browser) — that is the known limitation this whole route exists to fix, and it is
    // only resolved once the template emits {{ .TokenHash }}. Until then this is no worse
    // than the old behaviour, never better.
    const supabase = await createClient()
    const { error } = await supabase.auth.exchangeCodeForSession(code)
    if (!error) {
      return NextResponse.redirect(`${origin}${safeNext}`)
    }
    console.error('exchangeCodeForSession failed (expected cross-browser):', error.message)
  }

  // Invalid / expired / already-used link → send them somewhere they can recover.
  const fallback = type === 'recovery' ? '/reset-password?error=link_invalid' : '/login?error=link_invalid'
  return NextResponse.redirect(`${origin}${fallback}`)
}
