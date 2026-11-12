-- P2a — Garden yield + lifecycle integrity.
--
-- Three problems this closes, all of which made "cost vs yield per crop" unbuildable:
--
-- 1. Harvest yield had NOWHERE to live. UniversalLogForm folded it into free text
--    ("… · Logged 20 lbs") because garden_entries has no quantity/unit column, so it could
--    never be summed, compared year-over-year, or divided into cost.
-- 2. A `harvested` row could carry a NULL actual_harvest. The RPC's garden branch never set
--    it, so AI-logged harvests had no harvest date and a date_planted faked to the log date.
-- 3. `status` was an unconstrained text column — the linchpin of garden success rate.
--
-- Data is intentionally reset/repaired rather than shimmed (Kyle, 2026-07-08: "set it up in a
-- way that doesn't leave any old structure"). A full snapshot lives in
-- public.garden_entries_backup_20260708 (RLS on, no policies = deny-all; drop once P2 sticks).

-- ── 1. Yield columns ────────────────────────────────────────────────────────
alter table public.garden_entries
  add column if not exists quantity numeric,
  add column if not exists unit text;

comment on column public.garden_entries.quantity is
  'Harvest yield. NULL = not recorded (a harvest with an unknown amount is legal). Set when status becomes harvested.';
comment on column public.garden_entries.unit is
  'Unit for quantity (lbs, oz, bunches, count, pints, quarts…). Sourced from lib/units GARDEN_UNITS + the user''s custom_units.';

-- ── 2. Lift yield out of the notes text into the real columns ───────────────
-- Legacy AI-log rows encoded it as "<notes> · Logged <n> <unit>". Parse, promote, strip.
update public.garden_entries
set quantity = nullif((regexp_match(notes, ' · Logged ([0-9]+(?:\.[0-9]+)?)'))[1], '')::numeric,
    unit     = nullif((regexp_match(notes, ' · Logged [0-9]+(?:\.[0-9]+)? ([A-Za-z]+)'))[1], ''),
    notes    = nullif(regexp_replace(notes, ' · Logged [0-9]+(?:\.[0-9]+)?( [A-Za-z]+)?$', ''), '')
where notes ~ ' · Logged [0-9]';

-- ── 3. Repair harvested rows with no harvest date ───────────────────────────
-- These came from the RPC insert, which set date_planted = log_date and left actual_harvest
-- NULL. The log date IS the harvest date; the planting date was never actually known.
update public.garden_entries
set actual_harvest = date_planted,
    date_planted   = null
where status = 'harvested' and actual_harvest is null and date_planted is not null;

-- Any remainder (harvested, no date at all) falls back to the row's creation date rather
-- than blocking the constraint below.
update public.garden_entries
set actual_harvest = created_at::date
where status = 'harvested' and actual_harvest is null;

-- ── 4. Make illegal states unrepresentable (BUILD-BIBLE Dim 3) ──────────────
alter table public.garden_entries
  drop constraint if exists garden_entries_status_check;
alter table public.garden_entries
  add constraint garden_entries_status_check
  check (status in ('planned','planted','growing','harvested','failed'));

-- A harvest without a harvest date is the silent-zero shape we just repaired. Forbid it.
alter table public.garden_entries
  drop constraint if exists garden_entries_harvested_needs_date;
alter table public.garden_entries
  add constraint garden_entries_harvested_needs_date
  check (status <> 'harvested' or actual_harvest is not null);

-- Yield is optional, but a negative yield is never meaningful.
alter table public.garden_entries
  drop constraint if exists garden_entries_quantity_nonneg;
alter table public.garden_entries
  add constraint garden_entries_quantity_nonneg
  check (quantity is null or quantity >= 0);

-- Find-the-open-planting (harvest binding) filters on user + crop + status.
create index if not exists idx_garden_entries_user_crop_status
  on public.garden_entries (user_id, lower(trim(crop_name)), status);

-- ── 5. Remove old structure ─────────────────────────────────────────────────
-- homestead_connections was write-orphaned by commit 1bba651 (nothing reads it, nothing
-- writes it) and is empty. No reader, no data, no reason to keep the shape around.
drop table if exists public.homestead_connections;
