-- Close a CRITICAL cross-account household takeover.  (RLS audit 2026-08-05)
--
-- THE HOLE: two policies on family_members combined into a privilege escalation.
--   "Owner manages family members"  ALL     USING auth.uid() = owner_id
--   "Member can accept own invite"  UPDATE  USING/WITH CHECK auth.uid() = member_id
-- The UPDATE policy's WITH CHECK validated ONLY member_id and never pinned owner_id
-- (Postgres RLS cannot reference OLD in a WITH CHECK). So any authenticated user could:
--   1. INSERT a row naming themselves as BOTH owner and member   -- allowed by policy 1
--   2. UPDATE that row, repointing owner_id at any victim        -- allowed by policy 2
-- is_family_authorized() then returned true and opened all 34 household tables to them,
-- for READ and WRITE. Proven on prod (rolled back): 0 -> 24 daily_log + 2 children visible;
-- as the attacker, 24 logs and 17 attendance rows deleted and 2 children renamed.
--
-- WHY IT WENT UNNOTICED: the web app has no client-side write path to this table, so the
-- hole was unreachable through the UI. The native client talks straight to PostgREST, which
-- makes it directly reachable -- hence fixing it before that ships.
--
-- THE FIX: both client write paths are dead code. Every write to family_members in the
-- codebase runs through createAdminClient() (service_role, bypasses RLS) --
-- src/app/api/family/invite/route.ts and src/app/api/family/accept/route.ts. The only client
-- usage is two SELECTs on the account page. So client write access is removed outright
-- rather than patched, which removes the escalation instead of narrowing it.
--
-- 🔴 CONSEQUENCE, DELIBERATE: family_members is now service-role-write-only. The native
-- client MUST invite/accept via an API route and must NEVER write this table directly.
-- Recorded as a seam in cultivate/docs/NATIVE-V1-SPEC.md §8a.
--
-- Verified before applying, in a transaction forced to ROLLBACK: step 1 blocked
-- ("new row violates row-level security policy"), step 2 changed 0 rows, victim data
-- unreachable (authorized=false, 0 logs, 0 children), and the owner still read their own
-- 24 logs and 1 invite -- no regression.

drop policy if exists "Member can accept own invite" on public.family_members;
drop policy if exists "Owner manages family members"  on public.family_members;

-- Owners keep READ of the invites they sent (account page, owner view).
create policy "Owner reads own invites"
  on public.family_members
  for select
  to authenticated
  using ((select auth.uid()) = owner_id);

-- NOTE: "Member can view own invite" (SELECT on member_id) is intentionally left in place --
-- it is the member-side read the account page uses and it carries no write capability.
