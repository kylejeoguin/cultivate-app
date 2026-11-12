-- pgTAP — the security properties proven during the 2026-08-05 RLS audit.
--
-- WHY THIS FILE EXISTS: that audit found a CRITICAL cross-account household takeover that had
-- been live and unnoticed, precisely because no UI could reach it. Everything below was verified
-- by hand against prod once. A one-time proof decays — a future migration can silently reopen any
-- of it. These are the assertions that keep it true.
--
-- RUN: `supabase test db`  (Supabase CLI + local stack).
--
-- ⚠️ READ THIS BEFORE TRUSTING A GREEN CI BADGE: as of 2026-08-05 the `pgTAP RLS isolation` job has
-- FAILED on every run since 2026-07-28 — the ephemeral database cannot be built, because
-- `supabase/migrations/` creates only 11 of prod's 43 tables (the rest live in `scripts/*.sql` or
-- were applied ad-hoc). Migration 20260727210000 references `public.equipment_services`, which no
-- migration creates, and the chain dies there. **Until a baseline schema migration lands, these
-- tests do not run.** See docs/RLS-AUDIT-2026-08-05.md.

begin;
select plan(11);

-- ── Fixtures ────────────────────────────────────────────────────────────────
-- Created as the superuser BEFORE dropping to `authenticated`, because clients can no longer
-- write family_members at all — which is itself one of the properties under test.
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000000a1', 'owner@cultivate.test'),
  ('00000000-0000-0000-0000-0000000000b1', 'member@cultivate.test'),
  ('00000000-0000-0000-0000-0000000000c1', 'stranger@cultivate.test');

insert into public.children (user_id, name)
  values ('00000000-0000-0000-0000-0000000000a1', 'Owner-child');

-- An ACCEPTED family member of the owner.
insert into public.family_members (owner_id, member_id, member_email, status, invite_token, accepted_at)
  values ('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000b1',
          'member@cultivate.test', 'accepted', 'test-token-1', now());

-- ── PROPERTY 1-3: the takeover is closed ────────────────────────────────────
-- A stranger must not be able to manufacture a membership and repoint it at a household.
set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-0000000000c1","role":"authenticated"}', true);

select throws_ok(
  $$insert into public.family_members (owner_id, member_id, member_email, status, invite_token)
    values ('00000000-0000-0000-0000-0000000000c1','00000000-0000-0000-0000-0000000000c1',
            'stranger@cultivate.test','accepted','test-token-2')$$,
  '42501',
  null,
  'STEP 1 BLOCKED: a client cannot insert into family_members at all (writes are service-role only)'
);

-- Even given an existing row, no UPDATE policy exists, so a repoint changes nothing.
update public.family_members
   set owner_id = '00000000-0000-0000-0000-0000000000a1'
 where member_id = '00000000-0000-0000-0000-0000000000c1';
select is(
  (select count(*) from public.family_members
    where owner_id = '00000000-0000-0000-0000-0000000000a1'
      and member_id = '00000000-0000-0000-0000-0000000000c1')::int,
  0,
  'STEP 2 BLOCKED: a client cannot repoint family_members.owner_id at another household'
);

select is(
  public.is_family_authorized('00000000-0000-0000-0000-0000000000a1'),
  false,
  'A stranger is NOT family-authorized for another household'
);

-- ── PROPERTY 4: and therefore sees none of that household's data ────────────
select is(
  (select count(*) from public.children)::int, 0,
  'A stranger reads ZERO children from another household'
);

-- ── PROPERTY 5-6: legitimate sharing still works, in BOTH directions ────────
-- (One-directional sharing was a real shipped bug — owner could not see what the invited
--  parent wrote. Assert both ways or the fix can silently regress to half-working.)
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-0000000000b1","role":"authenticated"}', true);

select is(
  public.is_family_authorized('00000000-0000-0000-0000-0000000000a1'),
  true,
  'An ACCEPTED family member IS authorized for the owner''s household'
);

select is(
  (select count(*) from public.children)::int, 1,
  'An accepted member CAN read the household''s children'
);

-- The member writes a row; the household normalization trigger must file it under the OWNER.
insert into public.children (user_id, name) values (null, 'Member-added-child');

select is(
  (select count(*) from public.children
    where user_id = '00000000-0000-0000-0000-0000000000a1')::int,
  2,
  'A member''s write is normalized onto the OWNER''s household (not their own id)'
);

select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-0000000000a1","role":"authenticated"}', true);
select is(
  (select count(*) from public.children)::int, 2,
  'The OWNER can read what the invited member wrote (sharing is BIDIRECTIONAL)'
);

-- ── PROPERTY 7: cross-household writes are refused, loudly ──────────────────
select throws_ok(
  $$insert into public.children (user_id, name)
    values ('00000000-0000-0000-0000-0000000000c1','smuggled')$$,
  '42501',
  null,
  'Writing a row owned by ANOTHER household raises household violation'
);

-- ── PROPERTY 8-9: attendance never outlives the log that created it ─────────
-- (Deleting a school log used to leave the child marked PRESENT — stale evidence on the record
--  a state evaluator reads. Only LOG-created attendance may be auto-cleaned; a parent's manual
--  mark must survive, or the fix destroys real data.)
insert into public.daily_log (id, user_id, child_id, log_date, notes)
  select '00000000-0000-0000-0000-00000000d001',
         '00000000-0000-0000-0000-0000000000a1', c.id, '2030-01-01', 'test log'
    from public.children c where c.name = 'Owner-child';
insert into public.attendance (user_id, child_id, attendance_date, status, source)
  select '00000000-0000-0000-0000-0000000000a1', c.id, '2030-01-01', 'present', 'log'
    from public.children c where c.name = 'Owner-child';

delete from public.daily_log where id = '00000000-0000-0000-0000-00000000d001';

select is(
  (select count(*) from public.attendance where attendance_date = '2030-01-01')::int,
  0,
  'Deleting the only log for a day CLEARS the attendance it created'
);

-- A hand-entered mark must be untouched by log deletion.
insert into public.daily_log (id, user_id, child_id, log_date, notes)
  select '00000000-0000-0000-0000-00000000d002',
         '00000000-0000-0000-0000-0000000000a1', c.id, '2030-01-02', 'test log 2'
    from public.children c where c.name = 'Owner-child';
insert into public.attendance (user_id, child_id, attendance_date, status, source)
  select '00000000-0000-0000-0000-0000000000a1', c.id, '2030-01-02', 'present', 'manual'
    from public.children c where c.name = 'Owner-child';

delete from public.daily_log where id = '00000000-0000-0000-0000-00000000d002';

select is(
  (select count(*) from public.attendance where attendance_date = '2030-01-02')::int,
  1,
  'A MANUAL attendance mark SURVIVES deletion of a log on the same day'
);

select * from finish();
rollback;
