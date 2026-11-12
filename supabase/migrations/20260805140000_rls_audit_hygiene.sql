-- Low-severity cleanup from the RLS audit 2026-08-05. Four independent items.

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. household_owner_of() was executable by `anon` via /rest/v1/rpc/.
--    It is SECURITY DEFINER, so an unauthenticated caller could probe any uuid and learn
--    whether that account belongs to a household and who owns it -- a weak enumeration
--    primitive against user ids. Nothing anonymous has any reason to call it.
--    normalize_household_row() is a TRIGGER function: Postgres does NOT check EXECUTE
--    privilege when firing a trigger, so revoking it breaks nothing and removes a
--    pointless RPC surface. (Verified with a live insert after revoking.)
revoke execute on function public.household_owner_of(uuid)  from anon;
revoke execute on function public.normalize_household_row() from anon, authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Six policies were scoped to role `{public}` (which INCLUDES anon) rather than
--    `{authenticated}`. They fail closed today -- but only BY ACCIDENT: anon lacks EXECUTE
--    on is_family_authorized, so the predicate ERRORS instead of returning empty. That is
--    defense by coincidence, and it also means an anon caller gets a 500 rather than an
--    empty set. Scope them properly.
drop policy if exists "Family access custom_units"          on public.custom_units;
drop policy if exists "Family access equipment_service_log" on public.equipment_service_log;
drop policy if exists "Family access equipment_services"    on public.equipment_services;
drop policy if exists "Family access photos"                on public.photos;
drop policy if exists "Family access yearbook_notes"        on public.yearbook_notes;
drop policy if exists "Family access yearbook_slots"        on public.yearbook_slots;

create policy "Family access custom_units"          on public.custom_units
  for all to authenticated using (public.is_family_authorized(user_id));
create policy "Family access equipment_service_log" on public.equipment_service_log
  for all to authenticated using (public.is_family_authorized(user_id));
create policy "Family access equipment_services"    on public.equipment_services
  for all to authenticated using (public.is_family_authorized(user_id));
create policy "Family access photos"                on public.photos
  for all to authenticated using (public.is_family_authorized(user_id));
create policy "Family access yearbook_notes"        on public.yearbook_notes
  for all to authenticated using (public.is_family_authorized(user_id));
create policy "Family access yearbook_slots"        on public.yearbook_slots
  for all to authenticated using (public.is_family_authorized(user_id));

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. garden_entries_backup_20260708 -- a 20-row snapshot of real user garden data taken
--    during the July work. RLS-enabled with zero policies so it was unreachable, but it is
--    stale PII with no owner, no retention reason, and it shows up in every schema listing.
drop table if exists public.garden_entries_backup_20260708;

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. events accepted anon INSERT with `WITH CHECK (true)` -- literally any payload, any size.
--    The app's own beacon posts through /api/track, which already clamps every field, so
--    these bounds match what legitimate traffic already sends (widest observed: query 346
--    chars, metadata 105 bytes). This closes the direct-to-PostgREST path.
--    ⚠️ SCOPE HONESTY: this bounds payload SHAPE, not VOLUME. Flood protection is an edge
--    rate-limit concern and RLS cannot express it -- deliberately not solved here.
--    Deliberately NOT an event_type allowlist: a new event type would then fail silently at
--    the database, which is a worse failure mode than a large string.
drop policy if exists "Anyone can insert events" on public.events;
create policy "Anyone can insert events"
  on public.events for insert to anon, authenticated
  with check (
        length(event_type)               <=   50
    and length(coalesce(path,''))        <=  200
    and length(coalesce(query,''))       <= 1000
    and length(coalesce(source,''))      <=  100
    and length(coalesce(session_id,''))  <=  100
    and length(coalesce(referrer_host,'')) <= 200
    and length(coalesce(utm_source,''))  <=  100
    and length(coalesce(utm_medium,''))  <=  100
    and length(coalesce(utm_campaign,'')) <= 200
    and length(coalesce(utm_content,'')) <=  200
    and length(coalesce(utm_term,''))    <=  200
    and pg_column_size(metadata)         <= 2000
  );
