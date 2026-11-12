import { createClient } from './supabase/server'
import { getCachedUser } from './auth'

export type AccessReason =
  | 'admin'
  | 'beta'
  | 'active'
  | 'trialing'
  | 'lapsed' // had a subscription that is no longer active/trialing (canceled, past_due, unpaid, etc.)
  | 'none' // never subscribed / not logged in

export type AccessInfo = {
  hasAccess: boolean
  reason: AccessReason
}

// Single source of truth for who can use the app — and WHY.
// Lapsed (former) subscribers keep an export-only path; never-subscribed users are sent to convert.
export async function getAccessInfo(): Promise<AccessInfo> {
  const user = await getCachedUser()
  if (!user) return { hasAccess: false, reason: 'none' }

  if (user.email && user.email === process.env.ADMIN_EMAIL) return { hasAccess: true, reason: 'admin' }

  const supabase = await createClient()

  const [{ data: beta }, { data: sub }] = await Promise.all([
    supabase.from('beta_users').select('user_id, email').or(`user_id.eq.${user.id},email.eq.${user.email}`).maybeSingle(),
    supabase.from('subscriptions').select('status').eq('user_id', user.id).maybeSingle(),
  ])

  if (beta) return { hasAccess: true, reason: 'beta' }
  if (sub?.status === 'active') return { hasAccess: true, reason: 'active' }
  if (sub?.status === 'trialing') return { hasAccess: true, reason: 'trialing' }

  // Not entitled through their own account — but they may be an ACCEPTED member of someone
  // else's family plan. The owner holds the Stripe subscription; the member inherits it and
  // gets the same reason (so downloads + spark limits follow the owner's plan state).
  // `subscriptions` RLS is owner-only, so a member cannot read the owner's status directly —
  // this goes through the SECURITY DEFINER `family_plan_status()` fn, which returns only the
  // derived status ('active' | 'trialing'), never the owner's raw row. Revocation is automatic:
  // if the owner leaves active/trialing, the fn returns null on the next request.
  // Placed after the own-sub checks so a paying primary user never pays the extra round-trip.
  const { data: familyStatus } = await supabase.rpc('family_plan_status')
  if (familyStatus === 'active') return { hasAccess: true, reason: 'active' }
  if (familyStatus === 'trialing') return { hasAccess: true, reason: 'trialing' }

  // A subscription row exists but isn't active/trialing → they used to be a customer.
  // Keep them out of the app, but let them reach their data.
  if (sub?.status) return { hasAccess: false, reason: 'lapsed' }

  return { hasAccess: false, reason: 'none' }
}

export async function checkDashboardAccess(): Promise<boolean> {
  return (await getAccessInfo()).hasAccess
}

// Who may download a `tier = 'subscriber'` resource.
//
// Trials are IN, deliberately (Kyle, 2026-07-09). Cultivate is trial→paid with no free tier,
// and the homestead-art activity sheets are the reason someone converts — hiding them during
// the 7-day trial hides the reason to pay. Lapsed and never-subscribed users are OUT.
//
// This is the ONE definition. The download route enforces it and the Resources page renders
// its lock state from it, so the button and the gate can never disagree.
export function canDownloadSubscriberResource(reason: AccessReason): boolean {
  return reason === 'active' || reason === 'beta' || reason === 'admin' || reason === 'trialing'
}

// Spark ("Ideas") daily caps by tier. Cost is negligible at Haiku 4.5 (≈half a cent/call),
// so these are a convert-to-paid lever (trial gets a taste, paid gets headroom) + a
// denial-of-wallet ceiling — NOT a cost-control necessity. Tunable in one place.
export const SPARK_DAILY_LIMIT = { trial: 3, paid: 20 } as const

// trialing → the taste; active/beta/admin → the generous ceiling.
// lapsed/none never reach the app (the dashboard layout redirects them out).
export function sparkDailyLimit(reason: AccessReason): number {
  return reason === 'trialing' ? SPARK_DAILY_LIMIT.trial : SPARK_DAILY_LIMIT.paid
}
