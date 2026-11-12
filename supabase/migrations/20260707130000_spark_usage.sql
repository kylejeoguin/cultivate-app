-- ============================================================================
-- spark_usage: per-user, per-day counter for the Spark "Ideas" AI endpoint.
--
-- ⚠️  PROVENANCE: created on prod 2026-07-07 by hand-running
--     `scripts/spark-usage-migration.sql` (commit 635d88b) and never folded into
--     the migration chain. Recovered here verbatim, dated to when it actually ran.
--     See the header of 20260707120000 for why that mattered.
--
-- Enforces a tiered daily cap (trial vs paid) as a convert-to-paid lever + a
-- denial-of-wallet guard.
--
-- SERVER-ONLY WRITES BY DESIGN: RLS is enabled and there is deliberately NO
-- insert/update/delete policy, so only the service-role key (used server-side in
-- /api/spark and the Ideas page) can write. That is what makes the counter
-- tamper-proof — a user cannot reset or inflate their own count via the client SDK.
-- ============================================================================

create table if not exists public.spark_usage (
  user_id    uuid    not null references auth.users(id) on delete cascade,
  usage_date date    not null,
  count      integer not null default 0,
  updated_at timestamptz not null default now(),
  primary key (user_id, usage_date)
);

alter table public.spark_usage enable row level security;

-- SELECT-only policy: a signed-in user may READ their own row (for the on-load usage
-- meter on the Ideas page). Reading is harmless. Writes stay service-role-only.
create policy "spark_usage_select_own"
  on public.spark_usage
  for select
  to authenticated
  using ((select auth.uid()) = user_id);

-- Reproduced verbatim from prod so a schema diff comes back clean.
-- ⚠️ This comment is STALE ON PROD: it says "no policies", but the SELECT policy
-- above does exist (verified in pg_policies 2026-08-06). Corrected wording belongs
-- in a future migration that updates prod too — not here, where the only job is to
-- make the chain reproduce what prod actually has.
comment on table public.spark_usage is
  'Per-user/day Spark AI usage counter. Server-only (RLS on, no policies). Tiered daily cap enforced in /api/spark.';
