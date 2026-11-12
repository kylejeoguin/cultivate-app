-- Day-level photos with per-child attribution.
--
-- Photos are captured at the whole-day level, but daily_log rows are per-child-per-event,
-- so the old flow copied one photo array onto EVERY credited child's row — a photo of one
-- child ended up on all named kids' yearbook pages, with no way to say who's actually in it.
-- This table models a photo as its own thing, tagged with the child(ren) in it (child_ids).
-- The yearbook attributes by child_ids: a solo photo hits one kid, a group photo hits both.
--
-- child_ids may be empty = an untagged / general / family photo (shown in the family view,
-- not pinned to a specific child). Homestead-day photos live here too (they have no
-- daily_log to hang on). daily_log.photo_urls is still written for the log history views;
-- the yearbook prefers this table and de-dupes by URL, so nothing double-shows.
create table if not exists public.photos (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  url text not null,
  taken_on date not null,
  caption text,
  child_ids uuid[] not null default '{}',
  source text not null default 'log',
  created_at timestamptz not null default now()
);

create index if not exists idx_photos_user_date on public.photos (user_id, taken_on);

alter table public.photos enable row level security;

create policy "Users insert own photos"
  on public.photos for insert to authenticated
  with check ((select auth.uid()) = user_id);

create policy "Users read own photos"
  on public.photos for select to authenticated
  using ((select auth.uid()) = user_id);

create policy "Users update own photos"
  on public.photos for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy "Users delete own photos"
  on public.photos for delete to authenticated
  using ((select auth.uid()) = user_id);

grant select, insert, update, delete on public.photos to authenticated;
grant all on public.photos to service_role;
