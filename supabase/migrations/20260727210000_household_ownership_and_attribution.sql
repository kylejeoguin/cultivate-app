-- HOUSEHOLD OWNERSHIP + AUTHOR ATTRIBUTION + FAMILY-SHARE COMPLETENESS
--
-- Three defects, one root cause. Found 2026-07-27 while proposing the family-plan completeness fix;
-- Kyle asked two questions that exposed the rest ("can we tell who entered each row?" and "are we
-- certain there is no bleed?").
--
-- ROOT CAUSE: `user_id` was doing two incompatible jobs at once — "whose household does this row
-- belong to" AND "who typed it". Every write path stores `auth.uid()` (proven: all 9 INSERTs in
-- save_log_entry write v_uid := auth.uid(), zero references to an owner). Meanwhile the RLS
-- predicate `is_family_authorized(user_id)` only walks member -> owner. So:
--
--   DEFECT 1 (LIVE, all 28 shared tables) — SHARING IS ONE-DIRECTIONAL. A row written by the
--     invited parent is stored under THEIR id, and the owner is not a member of their family, so
--     the OWNER CANNOT SEE IT. Proven empirically on daily_log before this migration:
--        row written by member -> member sees 1, owner sees 0.
--     The day-7 trial email promises "it all lands in the same log." It does not.
--
--   DEFECT 2 — NO AUTHOR ATTRIBUTION. Once rows are correctly pooled into one household, "who
--     entered this" would be lost entirely. daily_log is a COMPLIANCE record; being unable to say
--     which parent recorded an entry is a real gap, not a nicety.
--
--   DEFECT 3 — SIX TABLES WERE NEVER SHARED AT ALL (photos, yearbook_notes, yearbook_slots,
--     custom_units, equipment_services, equipment_service_log). The invited parent sees
--     "service due" via the shared equipment_maintenance rollup but cannot see WHAT service or
--     WHEN it was last done. custom_units additionally had NO UPDATE policy at all.
--
-- THE FIX — separate the two jobs:
--     user_id    = the HOUSEHOLD this row belongs to (always the plan owner's id)
--     created_by = WHO actually wrote it (the authenticated author)
--
-- `user_id` is normalized by a BEFORE INSERT trigger rather than by changing ~34 call sites, so no
-- application write path has to change and nothing can be missed. RLS keeps the exact same shape
-- (`is_family_authorized(user_id)`) — it simply becomes CORRECT now that user_id is genuinely the
-- household. Uniformity across all 34 tables is the safety property; the July 2026 cross-account
-- leak came from a bespoke policy.
--
-- WHY user_id = OWNER rather than resolving the household dynamically at read time: educational
-- records must stay with the HOUSEHOLD. If a second parent ever leaves the plan, the household's
-- compliance history must not walk out with them.
--
-- SECURITY INVARIANT (from 20260721000000): every function parameter that shares a name with a
-- column MUST be qualified. Unqualified `owner_id` is what caused the 28-table leak. Both functions
-- below qualify their parameters.

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. Resolve any user to the household they belong to.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.household_owner_of(u uuid)
  RETURNS uuid
  LANGUAGE sql
  STABLE SECURITY DEFINER
  SET search_path TO ''
AS $function$
  SELECT COALESCE(
    (SELECT fm.owner_id
       FROM public.family_members fm
      WHERE fm.member_id = household_owner_of.u
        AND fm.status = 'accepted'
      ORDER BY fm.accepted_at NULLS LAST
      LIMIT 1),
    household_owner_of.u
  )
$function$;

-- ---------------------------------------------------------------------------
-- 2. Normalize every inserted row: route it to the household, stamp the author.
--    BEFORE INSERT only — an UPDATE must never rewrite ownership or re-stamp the
--    original author. Postgres evaluates the RLS WITH CHECK against the row as it
--    stands AFTER before-triggers, so the normalized user_id is what gets checked.
--    A NULL auth.uid() (service role: webhooks, seeds, admin) leaves the row alone.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.normalize_household_row()
  RETURNS trigger
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
AS $function$
BEGIN
  IF auth.uid() IS NOT NULL THEN
    IF NEW.created_by IS NULL THEN
      NEW.created_by := auth.uid();
    END IF;
    NEW.user_id := public.household_owner_of(auth.uid());
  END IF;
  RETURN NEW;
END
$function$;

-- ---------------------------------------------------------------------------
-- 3. Every family-shared table: add created_by, preserve existing authorship,
--    re-point rows to the household, attach the trigger.
--    Order matters — created_by must capture the ORIGINAL user_id before user_id
--    is rewritten, or the authorship of already-written rows is lost forever.
-- ---------------------------------------------------------------------------
DO $migrate$
DECLARE
  tbls text[] := ARRAY[
    -- already family-shared (28)
    'activities','assessment_logs','attendance','children','chore_completions',
    'curriculum_plans','curriculum_units','daily_log','equipment_maintenance','garden_beds',
    'garden_entries','grades','homeschool_expenses','homestead_chores','homestead_inputs',
    'livestock_animals','livestock_logs','planner_items','planner_weeks','portfolio_items',
    'preservation_logs','project_expenses','project_income','project_tasks','projects',
    'resources','school_years','subjects',
    -- newly shared by this migration (6)
    'photos','yearbook_notes','yearbook_slots','custom_units','equipment_services',
    'equipment_service_log'
  ];
  t text;
BEGIN
  FOREACH t IN ARRAY tbls LOOP
    EXECUTE format(
      'ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS created_by uuid REFERENCES auth.users(id)', t);

    -- Preserve who wrote each existing row BEFORE ownership is rewritten.
    EXECUTE format('UPDATE public.%I SET created_by = user_id WHERE created_by IS NULL', t);

    -- Pool member-authored rows into the household they belong to.
    EXECUTE format(
      'UPDATE public.%I SET user_id = public.household_owner_of(user_id)
        WHERE user_id <> public.household_owner_of(user_id)', t);

    EXECUTE format('DROP TRIGGER IF EXISTS trg_normalize_household ON public.%I', t);
    EXECUTE format(
      'CREATE TRIGGER trg_normalize_household BEFORE INSERT ON public.%I
         FOR EACH ROW EXECUTE FUNCTION public.normalize_household_row()', t);

    EXECUTE format('CREATE INDEX IF NOT EXISTS %I ON public.%I (created_by)',
                   'idx_' || t || '_created_by', t);
  END LOOP;
END
$migrate$;

-- ---------------------------------------------------------------------------
-- 4. The six tables that were never shared -> the single canonical ALL policy.
--    WITH CHECK is deliberately omitted to match children/daily_log EXACTLY: on an
--    ALL policy Postgres applies USING to new rows when WITH CHECK is absent, so
--    this is both functionally and textually identical to the working reference.
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "Users read own photos"            ON public.photos;
DROP POLICY IF EXISTS "Users insert own photos"          ON public.photos;
DROP POLICY IF EXISTS "Users update own photos"          ON public.photos;
DROP POLICY IF EXISTS "Users delete own photos"          ON public.photos;
DROP POLICY IF EXISTS "Users read own yearbook notes"    ON public.yearbook_notes;
DROP POLICY IF EXISTS "Users insert own yearbook notes"  ON public.yearbook_notes;
DROP POLICY IF EXISTS "Users update own yearbook notes"  ON public.yearbook_notes;
DROP POLICY IF EXISTS "Users delete own yearbook notes"  ON public.yearbook_notes;
DROP POLICY IF EXISTS "Users read own yearbook slots"    ON public.yearbook_slots;
DROP POLICY IF EXISTS "Users insert own yearbook slots"  ON public.yearbook_slots;
DROP POLICY IF EXISTS "Users update own yearbook slots"  ON public.yearbook_slots;
DROP POLICY IF EXISTS "Users delete own yearbook slots"  ON public.yearbook_slots;
DROP POLICY IF EXISTS "Users read own units"             ON public.custom_units;
DROP POLICY IF EXISTS "Users insert own units"           ON public.custom_units;
DROP POLICY IF EXISTS "Users delete own units"           ON public.custom_units;
DROP POLICY IF EXISTS "equipment_services_own"           ON public.equipment_services;
DROP POLICY IF EXISTS "equipment_service_log_own"        ON public.equipment_service_log;

CREATE POLICY "Family access photos"                ON public.photos                FOR ALL USING (is_family_authorized(user_id));
CREATE POLICY "Family access yearbook_notes"        ON public.yearbook_notes        FOR ALL USING (is_family_authorized(user_id));
CREATE POLICY "Family access yearbook_slots"        ON public.yearbook_slots        FOR ALL USING (is_family_authorized(user_id));
CREATE POLICY "Family access custom_units"          ON public.custom_units          FOR ALL USING (is_family_authorized(user_id));
CREATE POLICY "Family access equipment_services"    ON public.equipment_services    FOR ALL USING (is_family_authorized(user_id));
CREATE POLICY "Family access equipment_service_log" ON public.equipment_service_log FOR ALL USING (is_family_authorized(user_id));

-- ---------------------------------------------------------------------------
-- 5. Make "one household per person" a DATABASE invariant, not a code convention.
--    Previously only accept/route.ts enforced it, and its `.single()` lookup ERRORS
--    on 2+ rows -> the guard failed OPEN. Two concurrent accepts could also race it.
--    Anyone holding two accepted memberships would see BOTH households' data.
-- ---------------------------------------------------------------------------
CREATE UNIQUE INDEX IF NOT EXISTS uniq_family_member_single_household
  ON public.family_members (member_id)
  WHERE status = 'accepted' AND member_id IS NOT NULL;

COMMIT;
