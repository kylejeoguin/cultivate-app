import type { createClient } from '@/lib/supabase/server'

type ServerClient = Awaited<ReturnType<typeof createClient>>

/**
 * Resolve which HOUSEHOLD a user's data lives under.
 *
 * Since migration 20260727210000, `user_id` on every family-shared table means "the household
 * this row belongs to" (always the plan owner's id) rather than "who typed it" — authorship
 * moved to `created_by`. A BEFORE INSERT trigger normalizes writes, so an invited parent's rows
 * are stored under the OWNER's id. That is what makes sharing symmetric: the owner can finally
 * see what the second parent logged.
 *
 * The consequence for READ paths: any query that pins `.eq('user_id', user.id)` as a
 * belt-and-suspenders filter alongside RLS will match NOTHING when the caller is an invited
 * member, because their rows are not under their own id. Those call sites must pin the household
 * id instead. RLS (`is_family_authorized(user_id)`) remains the real security boundary — this
 * only keeps the redundant filter correct instead of silently over-filtering.
 *
 * For a user who owns their plan (the overwhelming majority) this returns their own id, so
 * behaviour is unchanged.
 *
 * Falls back to the caller's own id if the lookup fails — never throws, and never widens access:
 * RLS still gates every row regardless of what this returns.
 */
export async function householdOwnerId(supabase: ServerClient, userId: string): Promise<string> {
  const { data, error } = await supabase.rpc('household_owner_of', { u: userId })
  if (error || !data) return userId
  return data as string
}
