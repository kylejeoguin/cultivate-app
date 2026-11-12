-- Web Push subscriptions — one row per DEVICE per PERSON.
--
-- WHY THIS EXISTS: reminders move from email to web push as the primary channel
-- (Kyle, 2026-09-26). The decision layer (src/lib/notifications/decide.ts) is unchanged;
-- this table is the delivery address book for the new `web` channel, the same way
-- notification_prefs.destination is the address for `email`.
--
-- Design follows Lee's Supabase + Vercel web-push guide
-- (research/engineering/2026-09-25-web-push-supabase-vercel-LEE.md):
--   * `endpoint` is UNIQUE so re-registration is an UPSERT, never a duplicate row.
--   * Users manage only their own rows (RLS). The reminder cron reads everyone's rows
--     with the service-role key, which bypasses RLS by design.
--   * The cron deletes rows the push service reports as gone (404 / 410).
--
-- ⚠️⚠️ PER PERSON, NOT PER HOUSEHOLD. This table must NEVER be added to the
-- household-normalization trigger array (20260727210000_household_ownership_and_attribution.sql).
-- That trigger rewrites user_id to the plan owner — on a Family plan both parents' phones
-- would collapse onto the owner and only ONE person would ever be notified. Same posture
-- as notification_prefs / notification_sends.

create table if not exists public.push_subscriptions (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users(id) on delete cascade,
  endpoint      text not null unique,
  p256dh        text not null,
  auth          text not null,
  platform      text check (platform in ('web','ios-pwa','android')),
  user_agent    text,
  created_at    timestamptz not null default now(),
  last_seen_at  timestamptz not null default now()
);

create index if not exists push_subscriptions_user_id_idx
  on public.push_subscriptions (user_id);

alter table public.push_subscriptions enable row level security;

drop policy if exists "push_subscriptions_select_own" on public.push_subscriptions;
drop policy if exists "push_subscriptions_insert_own" on public.push_subscriptions;
drop policy if exists "push_subscriptions_update_own" on public.push_subscriptions;
drop policy if exists "push_subscriptions_delete_own" on public.push_subscriptions;

create policy "push_subscriptions_select_own" on public.push_subscriptions
  for select to authenticated using ((select auth.uid()) = user_id);
create policy "push_subscriptions_insert_own" on public.push_subscriptions
  for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "push_subscriptions_update_own" on public.push_subscriptions
  for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
create policy "push_subscriptions_delete_own" on public.push_subscriptions
  for delete to authenticated using ((select auth.uid()) = user_id);

-- anon has no business here at all. Revoke from BOTH public and anon — Supabase's default
-- privileges grant anon explicitly, so revoking only from public is a no-op.
revoke all on public.push_subscriptions from public;
revoke all on public.push_subscriptions from anon;
grant select, insert, update, delete on public.push_subscriptions to authenticated;

comment on table public.push_subscriptions is
  'Web Push subscriptions, one row per device per PERSON. NOT household-normalized — see migration header.';
