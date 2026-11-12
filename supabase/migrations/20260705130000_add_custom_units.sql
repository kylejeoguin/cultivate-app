-- User-defined measurement units for homestead logging.
--
-- The unit dropdowns (livestock/preservation in the dedicated forms, and now the AI
-- log's confirm step) offer a curated built-in list per context. Homesteaders track
-- units we can't fully enumerate (bushels, pecks, cords, "head"…), so a user can add
-- their own — stored here, GLOBAL to that user (shown in every unit dropdown), and
-- reusable so reports aggregate on ONE canonical string instead of free-text variants.
-- Deleting a unit only removes it from FUTURE dropdowns; past logs keep their stored
-- unit text (denormalized), so history and reports never change retroactively.
create table if not exists public.custom_units (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  unit text not null check (char_length(trim(unit)) between 1 and 30),
  created_at timestamptz not null default now()
);

-- One of each unit per user, case-insensitive ("Bushels" == "bushels").
create unique index if not exists custom_units_user_unit_uniq
  on public.custom_units (user_id, lower(trim(unit)));

alter table public.custom_units enable row level security;

create policy "Users insert own units"
  on public.custom_units for insert to authenticated
  with check ((select auth.uid()) = user_id);

create policy "Users read own units"
  on public.custom_units for select to authenticated
  using ((select auth.uid()) = user_id);

create policy "Users delete own units"
  on public.custom_units for delete to authenticated
  using ((select auth.uid()) = user_id);

grant select, insert, delete on public.custom_units to authenticated;
grant all on public.custom_units to service_role;
