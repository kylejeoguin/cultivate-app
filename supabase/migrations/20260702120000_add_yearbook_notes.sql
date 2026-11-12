-- Per-child parent/guardian message for the yearbook (the "Dear [Name]" letter).
-- One row per child per school year. RLS: a user may read/write only their OWN notes.
-- The message is the ONE hand-written, emotional part of the yearbook — never AI-generated.
create table if not exists public.yearbook_notes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  child_id uuid not null references public.children(id) on delete cascade,
  school_year_id uuid not null references public.school_years(id) on delete cascade,
  message text not null default '' check (char_length(message) <= 5000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (child_id, school_year_id)
);

alter table public.yearbook_notes enable row level security;

create policy "Users read own yearbook notes"
  on public.yearbook_notes for select to authenticated
  using ((select auth.uid()) = user_id);

create policy "Users insert own yearbook notes"
  on public.yearbook_notes for insert to authenticated
  with check ((select auth.uid()) = user_id);

create policy "Users update own yearbook notes"
  on public.yearbook_notes for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy "Users delete own yearbook notes"
  on public.yearbook_notes for delete to authenticated
  using ((select auth.uid()) = user_id);

-- Policy + lookup columns indexed (RLS uses user_id; the app looks up by child+year).
create index if not exists idx_yearbook_notes_user on public.yearbook_notes (user_id);

grant select, insert, update, delete on public.yearbook_notes to authenticated;
grant all on public.yearbook_notes to service_role;
