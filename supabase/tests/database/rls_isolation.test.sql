-- pgTAP — tenant isolation (P3 from the BUILD-BIBLE gap-audit)
-- Proves an AUTHENTICATED user cannot read ANOTHER user's family/child data.
-- This is the test the empirical anon-probe could NOT cover (anon-blocking ≠ A-can't-read-B).
--
-- RUN: `supabase test db`  (requires the Supabase CLI + a local stack: `supabase start`).
--   The CLI is not installed on this machine yet — install before running:
--   https://supabase.com/docs/guides/local-development
--
-- NOTE: column assumptions (user_id on children/daily_log) match the app's query patterns
-- (e.g. api/export uses .eq('user_id', user.id)). Adjust table/column names if the live
-- schema differs. Keep this test green in CI so a future migration can't silently leak data.

begin;
select plan(2);

-- Two synthetic users in auth.users
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-00000000000a', 'a@cultivate.test'),
  ('00000000-0000-0000-0000-00000000000b', 'b@cultivate.test');

-- User A owns one child row
insert into public.children (user_id, name)
  values ('00000000-0000-0000-0000-00000000000a', 'A-child');

-- ── Act as user B (authenticated role + B's JWT claim drives auth.uid()) ──
set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-00000000000b","role":"authenticated"}', true);

-- B must see ZERO of A's children
select is(
  (select count(*) from public.children
     where user_id = '00000000-0000-0000-0000-00000000000a')::int,
  0,
  'User B cannot read User A''s children (RLS isolates tenants)'
);

-- B sees ZERO children total (B owns none)
select is(
  (select count(*) from public.children)::int,
  0,
  'User B sees no children at all under RLS'
);

select * from finish();
rollback;
