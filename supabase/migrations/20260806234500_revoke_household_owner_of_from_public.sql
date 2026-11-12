-- ============================================================================
-- Close the anon-reachable enumeration primitive on household_owner_of.
--
-- The 2026-08-05 RLS audit recorded this as "revoked from anon". IT WAS NOT
-- EFFECTIVE. Postgres grants EXECUTE on every new function to PUBLIC by default,
-- and `anon` inherits PUBLIC -- so revoking from `anon` alone left the function
-- wide open.
--
-- Proven on prod 2026-08-06, measured not reasoned:
--     anon POST /rest/v1/rpc/household_owner_of   -> HTTP 200 (returned a value)
--     anon POST /rest/v1/rpc/is_family_authorized -> HTTP 401 (correctly denied)
-- The difference was visible in pg_proc.proacl all along: household_owner_of
-- carried a leading `=X/postgres` entry (an EMPTY grantee, which IS PUBLIC) and
-- is_family_authorized did not.
--
-- After this migration: anon -> 401, and as an authenticated user the function
-- still resolves and RLS still returns that user's own rows (verified: 24 logs,
-- 2 children). `authenticated` and `service_role` keep EXECUTE, so the RLS
-- policies, the 08-05 household-aware storage policies, and the app are unaffected.
--
-- ⭐ GENERALIZABLE: to actually lock down a SECURITY DEFINER function you must
--    revoke from PUBLIC, not just from the anon role. Grep pg_proc.proacl for a
--    leading "=X/" -- that empty grantee is PUBLIC, and it is what anon inherits.
--    Severity here is low (a relationship oracle needing an already-known uuid),
--    but "we revoked it" was recorded as true for a day while it was false.
-- ============================================================================

revoke execute on function public.household_owner_of(uuid) from public;
revoke execute on function public.household_owner_of(uuid) from anon;
