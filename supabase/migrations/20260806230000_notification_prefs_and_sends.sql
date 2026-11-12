-- ============================================================================
-- Reminder plumbing: per-PERSON delivery preferences + a send ledger.
--
-- WHY THIS EXISTS: Cultivate's measured bottleneck is RETENTION -- across every
-- trial, nobody has ever returned a second day. A reminder is a retention
-- mechanism, so this is a retention experiment, not a feature. The ledger below
-- is what makes it an experiment: it records every send so we can ask whether a
-- nudge actually causes a day-2 return.
--
-- ⚠️⚠️ DO NOT ADD EITHER TABLE TO THE HOUSEHOLD-NORMALIZATION TRIGGER ARRAY in
--      20260727210000_household_ownership_and_attribution.sql.
--      That trigger rewrites user_id to the PLAN OWNER's id. A notification
--      preference belongs to a PERSON (and later, to a person's DEVICE) -- not to
--      a household. If these were normalized, both parents on a Family plan would
--      collapse onto the owner and only ONE of them would ever be notified.
--      The trigger loops an EXPLICIT table array, so new tables do NOT inherit it.
--      That is deliberate and correct here. Leave it that way.
--
-- CHANNEL-AGNOSTIC BY DESIGN: `channel` carries 'email' | 'web' | 'apns' | 'fcm'
-- from day one. v1 delivers email only (Resend is already live), because push is a
-- delivery optimisation on a behaviour we have not yet proven. When the native iOS
-- client lands, APNs becomes another row value -- the decision layer above this
-- schema does not change.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. notification_prefs -- one row per PERSON. Opt-IN (enabled defaults false).
-- ---------------------------------------------------------------------------
create table if not exists public.notification_prefs (
  user_id              uuid primary key references auth.users(id) on delete cascade,
  channel              text not null default 'email'
                         check (channel in ('email','web','apns','fcm')),
  -- Email address, or (later) a push endpoint/token. Null = fall back to the
  -- account email at send time.
  destination          text,
  -- Opt-in. Nobody is ever enrolled by default -- an unrequested reminder is the
  -- fastest way to get the whole channel switched off.
  enabled              boolean  not null default false,
  -- Local send hour in the app's home timezone (America/Chicago -- see src/lib/date.ts).
  -- 19 = 7pm: the school day is done and logging actually happens then.
  send_hour_local      smallint not null default 19
                         check (send_hour_local between 0 and 23),
  -- A Saturday "you haven't logged school" is noise, and noise is what gets a
  -- reminder turned off. Homestead chores + equipment still fire any day.
  school_weekdays_only boolean  not null default true,
  -- Days a school log may go quiet before it is considered stale (matches the
  -- dashboard's existing isStale(..., 3)).
  school_stale_days    smallint not null default 3
                         check (school_stale_days between 1 and 30),
  -- How long before a STILL-overdue item is allowed to mention itself again.
  -- 3 = an item overdue a fortnight surfaces ~5 times, not 14.
  renag_days           smallint not null default 3
                         check (renag_days between 1 and 30),
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);

alter table public.notification_prefs enable row level security;

-- A person manages their OWN preferences. Scoped to `authenticated` (not `public`)
-- so it fails closed by design rather than by accident of a missing grant --
-- see 20260805140000_rls_audit_hygiene.sql.
create policy "notification_prefs_select_own" on public.notification_prefs
  for select to authenticated using ((select auth.uid()) = user_id);
create policy "notification_prefs_insert_own" on public.notification_prefs
  for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "notification_prefs_update_own" on public.notification_prefs
  for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

comment on table public.notification_prefs is
  'Per-PERSON reminder delivery prefs. NOT household-normalized -- see migration header.';

-- ---------------------------------------------------------------------------
-- 2. notification_sends -- the ledger. Server-only, like spark_usage.
-- ---------------------------------------------------------------------------
create table if not exists public.notification_sends (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users(id) on delete cascade,
  -- What kind of thing was mentioned.
  item_type  text not null check (item_type in ('school_log','chore','equipment_service')),
  -- Stable identity of the specific thing: the source row's id, or the literal
  -- 'school_log' for the singleton school-staleness nudge. Together with item_type
  -- this is what the re-nag window is measured against.
  item_key   text not null,
  -- Central-time calendar date of the send (NOT utc -- see src/lib/date.ts).
  sent_on    date not null,
  channel    text not null default 'email'
               check (channel in ('email','web','apns','fcm')),
  created_at timestamptz not null default now()
);

-- One mention of a given item per person per day, enforced in the database rather
-- than trusted from application logic -- a retried or double-fired cron must not be
-- able to email the same person twice.
create unique index if not exists notification_sends_unique_per_day
  on public.notification_sends (user_id, item_type, item_key, sent_on);

-- Drives the re-nag lookup ("when did we last mention this item to this person?").
create index if not exists notification_sends_recent_idx
  on public.notification_sends (user_id, item_type, item_key, sent_on desc);

alter table public.notification_sends enable row level security;

-- DELIBERATELY NO POLICIES -> anon and authenticated get ZERO access; only the
-- service-role key (the cron route) can read or write. Same posture as spark_usage:
-- a ledger a user can edit is not a ledger. RLS is ON so it fails closed.

comment on table public.notification_sends is
  'Reminder send ledger. Service-role only (RLS on, no policies). Enforces the re-nag window and is the measurement record for the day-2 return experiment.';
