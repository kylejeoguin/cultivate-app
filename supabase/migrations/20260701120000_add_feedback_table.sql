-- In-app user feedback from the floating Feedback button.
-- One row per submission. RLS: a user may insert + read only their OWN feedback;
-- Kyle reads all via the service role (Supabase Studio / admin client).
create table if not exists public.feedback (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  type text not null check (type in ('bug','idea','other')),
  message text not null check (char_length(message) between 1 and 5000),
  page_path text,
  user_agent text,
  viewport text,
  created_at timestamptz not null default now()
);

alter table public.feedback enable row level security;

create policy "Users insert own feedback"
  on public.feedback for insert to authenticated
  with check ((select auth.uid()) = user_id);

create policy "Users read own feedback"
  on public.feedback for select to authenticated
  using ((select auth.uid()) = user_id);

create index if not exists idx_feedback_created on public.feedback (created_at desc);

grant select, insert on public.feedback to authenticated;
grant all on public.feedback to service_role;
