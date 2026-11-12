-- pgTAP — save_log_entry's chore branch: written once, advanced once, replay-safe.
--
-- ⚠️ THIS FILE DOES NOT CURRENTLY RUN. As documented in security_properties.test.sql, the pgTAP
-- job has failed on every run since 2026-07-28: supabase/migrations/ builds only a fraction of
-- prod's tables, so the ephemeral database cannot be created and the chain dies before any test
-- executes. A test that cannot run is not a guard. It is written now so it is ready the moment a
-- baseline schema migration lands — and so the properties it asserts are recorded somewhere
-- other than a chat log.
--
-- WHAT WAS ACTUALLY VERIFIED (2026-09-02, by hand against prod, impersonating the demo user via
-- request.jwt.claims): calling save_log_entry twice for the same chore and date produced exactly
-- ONE completion row, advanced next_due_date exactly ONCE (+7, not +14 despite the retry asking
-- for +14), and stamped last_completed_date. That is the evidence today. This file is what keeps
-- it true tomorrow.
--
-- RUN: `supabase test db`

begin;
select plan(6);

-- ── Fixtures ────────────────────────────────────────────────────────────────
insert into auth.users (id, email)
  values ('00000000-0000-0000-0000-0000000000d1', 'chore-owner@cultivate.test'),
         ('00000000-0000-0000-0000-0000000000d2', 'chore-stranger@cultivate.test');

insert into public.homestead_chores
  (id, user_id, name, cadence_type, interval_days, estimated_minutes, next_due_date, is_active)
values
  ('00000000-0000-0000-0000-00000000c001', '00000000-0000-0000-0000-0000000000d1',
   'Clean the coop', 'interval', 7, 30, current_date, true),
  ('00000000-0000-0000-0000-00000000c002', '00000000-0000-0000-0000-0000000000d2',
   'Someone else''s chore', 'interval', 7, 30, current_date, true);

-- Act as the owner.
select set_config('request.jwt.claims',
  json_build_object('sub','00000000-0000-0000-0000-0000000000d1','role','authenticated')::text, true);

-- ── 1. A completion is written, and the schedule advances to the date supplied ──
select public.save_log_entry(current_date, null, jsonb_build_array(jsonb_build_object(
  'notes','Cleaned out the chicken coop',
  'chore', jsonb_build_object(
    'chore_id','00000000-0000-0000-0000-00000000c001',
    'next_due_date',(current_date + 7)::text,
    'school_credit', false,
    'child_ids','[]'::jsonb,
    'subject_ids','[]'::jsonb))));

select is(
  (select count(*)::int from public.chore_completions
    where chore_id = '00000000-0000-0000-0000-00000000c001'),
  1, 'one completion is written');

select is(
  (select next_due_date from public.homestead_chores
    where id = '00000000-0000-0000-0000-00000000c001'),
  current_date + 7, 'the schedule advances to the date the client computed');

select is(
  (select last_completed_date from public.homestead_chores
    where id = '00000000-0000-0000-0000-00000000c001'),
  current_date, 'last_completed_date is stamped');

-- ── 2. Replaying the same chore+date is a no-op, and must not re-advance ──────
-- This is the property that matters most in practice: a dropped connection or a double tap
-- must not push a daily chore a week into the future.
select public.save_log_entry(current_date, null, jsonb_build_array(jsonb_build_object(
  'notes','Cleaned out the chicken coop (retry)',
  'chore', jsonb_build_object(
    'chore_id','00000000-0000-0000-0000-00000000c001',
    'next_due_date',(current_date + 14)::text,
    'school_credit', false,
    'child_ids','[]'::jsonb,
    'subject_ids','[]'::jsonb))));

select is(
  (select count(*)::int from public.chore_completions
    where chore_id = '00000000-0000-0000-0000-00000000c001'),
  1, 'a retry does not insert a second completion');

select is(
  (select next_due_date from public.homestead_chores
    where id = '00000000-0000-0000-0000-00000000c001'),
  current_date + 7, 'a retry does not advance the schedule a second time');

-- ── 3. Another account's chore id in the payload writes nothing ───────────────
-- RLS guards reads; this proves the write path refuses a forged or stale id too.
select public.save_log_entry(current_date, null, jsonb_build_array(jsonb_build_object(
  'notes','Trying to complete a chore I do not own',
  'chore', jsonb_build_object(
    'chore_id','00000000-0000-0000-0000-00000000c002',
    'next_due_date',(current_date + 7)::text,
    'school_credit', false,
    'child_ids','[]'::jsonb,
    'subject_ids','[]'::jsonb))));

select is(
  (select count(*)::int from public.chore_completions
    where chore_id = '00000000-0000-0000-0000-00000000c002'),
  0, 'a chore belonging to another account is not completed');

select * from finish();
rollback;
