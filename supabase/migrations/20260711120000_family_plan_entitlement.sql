-- Family-plan entitlement: an accepted family member inherits the OWNER's subscription.
--
-- Bug this fixes: `getAccessInfo()` only checked `beta_users` and the user's OWN `subscriptions`
-- row. A family plan's secondary seat has NO subscription of their own — the owner holds the
-- Stripe subscription — so an accepted member resolved to `reason:'none'`, was redirected to
-- /pricing by the dashboard layout, and got 403 on subscriber worksheet downloads. Fails safe
-- (denies), but a paid family's second person could not use the product.
--
-- Why a SECURITY DEFINER function (not an app-side query): the `subscriptions` RLS is owner-only
-- (`auth.uid() = user_id`), so a member cannot read the owner's status from the app at all. This
-- function derives the caller's inherited entitlement inside the DB and exposes ONLY the resulting
-- status ('active' | 'trialing'), never the owner's raw subscription row. It mirrors the existing
-- `is_family_authorized()` (the data-layer equivalent) so the entitlement layer and the data layer
-- agree. Keeping this in the DB also means the always-on access path needs no service-role key.
--
-- Revocation is automatic: if the owner's subscription leaves active/trialing, the JOIN filter
-- stops matching and the member falls back to no access on the next request.
--
-- ACCEPTED ADVISOR WARNING: the Supabase linter (0029) flags this as a SECURITY DEFINER function
-- executable by `authenticated` via /rest/v1/rpc. That is intentional and inherent — SECURITY
-- INVOKER would break it (the member cannot read the owner's subscription under RLS, which is the
-- whole reason DEFINER is required). It exposes ONLY the caller's own derived status (auth.uid()),
-- takes no arguments, and pins search_path. Same accepted pattern as is_family_authorized().

CREATE OR REPLACE FUNCTION public.family_plan_status()
RETURNS TEXT
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT s.status
  FROM family_members fm
  JOIN subscriptions s ON s.user_id = fm.owner_id
  WHERE fm.member_id = auth.uid()
    AND fm.status = 'accepted'
    AND s.status IN ('active', 'trialing')
  ORDER BY (s.status = 'active') DESC  -- prefer an active owner over a merely-trialing one
  LIMIT 1;
$$;

-- Callable only by logged-in users; never anon/public.
-- (Supabase default privileges re-grant EXECUTE to anon on new public functions, so the
--  anon revoke must be explicit — REVOKE ... FROM PUBLIC alone does not remove it.)
REVOKE ALL ON FUNCTION public.family_plan_status() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.family_plan_status() FROM anon;
GRANT EXECUTE ON FUNCTION public.family_plan_status() TO authenticated;
