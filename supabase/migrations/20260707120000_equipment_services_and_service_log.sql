-- ============================================================================
-- Multi-service-type equipment servicing + service history.
--
-- ⚠️  PROVENANCE: this table pair was created on prod 2026-07-07 by hand-running
--     `scripts/equipment-services-migration.sql` (commit d649f37) and was never
--     folded into the migration chain. Because the CI/local baseline was dumped
--     2026-06-30 — BEFORE this ran — neither table existed when the chain replayed
--     from zero, and `20260727210000_household_ownership_and_attribution.sql`
--     (which ALTERs both) threw. That killed `supabase start`, which SKIPPED the
--     pgTAP step, which is why the RLS isolation guard never executed for 8 days.
--     Recovered here verbatim from that script, dated to when it actually ran.
--
--     Do NOT "modernise" the policies below to the household model. They are
--     deliberately the ORIGINAL per-user policies, because 20260727210000 DROPs
--     these exact policy names by name and replaces them. Changing them here
--     breaks that migration.
--
-- Replaces the single blanket interval on equipment_maintenance with per-service
-- definitions (calendar-days OR engine-hours) + a performed-service history log
-- (for the maintenance report and a printable resale service history).
-- equipment_maintenance.next_service_date/last_service_date are kept as an
-- app-maintained rollup (earliest-due / most-recent across an item's services) so
-- the dashboard / homestead / home-diy surfaces that read them keep working.
-- ============================================================================

create table if not exists public.equipment_services (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  equipment_id uuid not null references public.equipment_maintenance(id) on delete cascade,
  name text not null,
  interval_unit text not null default 'days' check (interval_unit in ('days','hours')),
  interval_value integer check (interval_value is null or interval_value > 0),
  last_service_date date,
  last_service_hours numeric check (last_service_hours is null or last_service_hours >= 0),
  next_due_date date,
  next_due_hours numeric check (next_due_hours is null or next_due_hours >= 0),
  notes text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists equipment_services_equipment_idx on public.equipment_services (equipment_id);
create index if not exists equipment_services_user_idx on public.equipment_services (user_id);
alter table public.equipment_services enable row level security;
create policy "equipment_services_own" on public.equipment_services
  for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create table if not exists public.equipment_service_log (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  equipment_id uuid not null references public.equipment_maintenance(id) on delete cascade,
  service_id uuid references public.equipment_services(id) on delete set null,
  service_name text not null,
  service_date date not null,
  hours_at_service numeric check (hours_at_service is null or hours_at_service >= 0),
  notes text,
  created_at timestamptz not null default now()
);
create index if not exists equipment_service_log_equipment_idx on public.equipment_service_log (equipment_id, service_date desc);
create index if not exists equipment_service_log_user_idx on public.equipment_service_log (user_id);
alter table public.equipment_service_log enable row level security;
create policy "equipment_service_log_own" on public.equipment_service_log
  for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

-- Backfill: each existing single-interval item becomes one "General service" (days-based).
-- On a fresh CI/local replay equipment_maintenance is empty, so this is a no-op there;
-- it is kept because it is what actually ran against prod.
insert into public.equipment_services
  (user_id, equipment_id, name, interval_unit, interval_value, last_service_date, next_due_date, notes)
select user_id, id, 'General service', 'days', service_interval_days, last_service_date, next_service_date, service_notes
from public.equipment_maintenance
where service_interval_days is not null;
