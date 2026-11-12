-- User-chosen photo overrides for the yearbook. Each editable photo position is a "slot"
-- identified by a stable slot_key (e.g. 'cover:hero', 'child:<uuid>:hero',
-- 'child:<uuid>:letter:0', 'month:2027-03:2'). A row here means the user hand-picked the
-- photo for that slot; absence means "use the system default". Render = override ?? default,
-- so regenerating the book keeps every hand-picked photo and only re-derives untouched slots.
-- child_id is set for child-scoped slots so a deleted child cleans up its overrides.
-- RLS: a user may read/write only their OWN slots.
create table if not exists public.yearbook_slots (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  school_year_id uuid not null references public.school_years(id) on delete cascade,
  child_id uuid references public.children(id) on delete cascade,
  slot_key text not null check (char_length(slot_key) between 1 and 200),
  photo_url text not null check (char_length(photo_url) between 1 and 2048),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, school_year_id, slot_key)
);

alter table public.yearbook_slots enable row level security;

create policy "Users read own yearbook slots"
  on public.yearbook_slots for select to authenticated
  using ((select auth.uid()) = user_id);

create policy "Users insert own yearbook slots"
  on public.yearbook_slots for insert to authenticated
  with check ((select auth.uid()) = user_id);

create policy "Users update own yearbook slots"
  on public.yearbook_slots for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy "Users delete own yearbook slots"
  on public.yearbook_slots for delete to authenticated
  using ((select auth.uid()) = user_id);

-- RLS filters by user_id; the app looks up all slots for a (user, school_year).
create index if not exists idx_yearbook_slots_user_year
  on public.yearbook_slots (user_id, school_year_id);

grant select, insert, update, delete on public.yearbook_slots to authenticated;
grant all on public.yearbook_slots to service_role;
