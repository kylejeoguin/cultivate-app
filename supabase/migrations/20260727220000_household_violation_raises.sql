-- Make a cross-household write FAIL LOUDLY instead of being silently redirected.
--
-- Kyle's call, 2026-07-27. The trigger introduced in 20260727210000 rewrote `user_id` to the
-- caller's household unconditionally. That made ownership non-spoofable, but it meant a client
-- sending ANOTHER household's id got a 200 back and the row quietly landed somewhere else — a
-- success response for a request that was not honoured. Silent coercion hides bugs: a genuine
-- application mistake and an attack look identical, and both look like success.
--
-- THE SUBTLETY (why this is not simply "raise on any mismatch"): every real write path passes the
-- caller's OWN uid — save_log_entry does `v_uid := auth.uid()`, yearbook-slot sends `user.id`, etc.
-- For an INVITED PARENT that value is NOT their household. Raising on any mismatch would break
-- every member write in the app. So the rule is three-way:
--
--   NEW.user_id = auth.uid()            -> legitimate app pattern, normalize to the household
--   NEW.user_id = the caller's household -> already correct, keep
--   anything else                        -> RAISE (42501 insufficient_privilege -> HTTP 403)
--
-- NULL auth.uid() (service role: webhooks, seeds, admin) is still passed through untouched.

CREATE OR REPLACE FUNCTION public.normalize_household_row()
  RETURNS trigger
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
AS $function$
DECLARE
  v_uid       uuid := auth.uid();
  v_household uuid;
BEGIN
  -- Service-role / unauthenticated writes are not household-scoped; leave them alone.
  IF v_uid IS NULL THEN
    RETURN NEW;
  END IF;

  v_household := public.household_owner_of(v_uid);

  IF NEW.created_by IS NULL THEN
    NEW.created_by := v_uid;
  END IF;

  IF NEW.user_id IS NOT NULL
     AND NEW.user_id <> v_uid
     AND NEW.user_id <> v_household THEN
    RAISE EXCEPTION 'household violation: cannot write a row owned by another household (%)', NEW.user_id
      USING ERRCODE = '42501',
            HINT = 'Rows belong to your own household. Do not set user_id to another account.';
  END IF;

  NEW.user_id := v_household;
  RETURN NEW;
END
$function$;
