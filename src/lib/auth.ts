import 'server-only'
import { cache } from 'react'
import type { User } from '@supabase/supabase-js'
import { createClient } from './supabase/server'

/**
 * Request-memoized current user.
 *
 * `supabase.auth.getUser()` makes a network round-trip to the Supabase Auth server
 * to revalidate the token. Multiple server components in one render (layout, access
 * check, the page itself) each calling it produces an auth waterfall — several
 * sequential network calls before anything renders.
 *
 * React `cache()` memoizes per request render, so every caller in the same navigation
 * shares ONE getUser() call. Use this everywhere instead of calling supabase.auth.getUser()
 * directly for the user identity. (Keep using createClient() for the actual data queries.)
 */
export const getCachedUser = cache(async (): Promise<User | null> => {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  return user
})
