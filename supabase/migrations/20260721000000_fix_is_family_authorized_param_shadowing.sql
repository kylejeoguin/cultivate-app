-- SECURITY FIX: is_family_authorized() leaked every account's data to any family member.
--
-- The function parameter was named `owner_id`, the same as the `family_members.owner_id`
-- column it compares against. In `WHERE fm.owner_id = owner_id`, Postgres resolves the
-- unqualified `owner_id` to the COLUMN, not the parameter — so the predicate became
-- `fm.owner_id = fm.owner_id`, which is always true. The membership check silently
-- collapsed to "is the caller an accepted member of ANY family", granting a family member
-- read/write/delete on EVERY owner's rows across all 28 tables that use this policy.
--
-- Present since the baseline; only exploitable once a family invite was accepted (the first
-- acceptance, 2026-07-21, surfaced it). Fix: qualify the parameter as
-- `is_family_authorized.owner_id` so it can never bind to the column. Signature unchanged,
-- so this is a clean CREATE OR REPLACE with no policy churn.

CREATE OR REPLACE FUNCTION public.is_family_authorized(owner_id uuid)
  RETURNS boolean
  LANGUAGE sql
  STABLE SECURITY DEFINER
  SET search_path TO ''
AS $function$
  SELECT auth.uid() = is_family_authorized.owner_id
  OR EXISTS (
    SELECT 1 FROM public.family_members fm
    WHERE fm.owner_id = is_family_authorized.owner_id
    AND fm.member_id = auth.uid()
    AND fm.status = 'accepted'
  )
$function$;
