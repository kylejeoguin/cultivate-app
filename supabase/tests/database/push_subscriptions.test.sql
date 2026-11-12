-- pgTAP — push_subscriptions is private per PERSON.
-- Proves: B cannot read, update, or delete A's device rows, cannot insert a row as A,
-- anon sees nothing, and the table is NOT household-normalized (A's user_id is kept).
--
-- RUN: `supabase test db` (local stack required).

begin;
select plan(6);

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000000a1', 'push-a@cultivate.test'),
  ('00000000-0000-0000-0000-0000000000b1', 'push-b@cultivate.test');

insert into public.push_subscriptions (user_id, endpoint, p256dh, auth, platform)
  values ('00000000-0000-0000-0000-0000000000a1', 'https://push.example/a-device', 'pA', 'aA', 'ios-pwa');

-- The row keeps A's own id — nothing rewrote it to a household owner.
select is(
  (select user_id::text from public.push_subscriptions where endpoint = 'https://push.example/a-device'),
  '00000000-0000-0000-0000-0000000000a1',
  'push_subscriptions.user_id is the person, not a household owner'
);

-- ── Act as B ──
set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-0000000000b1","role":"authenticated"}', true);

select is(
  (select count(*) from public.push_subscriptions)::int,
  0,
  'B cannot read A''s push subscriptions'
);

update public.push_subscriptions set p256dh = 'hijack' where endpoint = 'https://push.example/a-device';
delete from public.push_subscriptions where endpoint = 'https://push.example/a-device';

select throws_ok(
  $$ insert into public.push_subscriptions (user_id, endpoint, p256dh, auth)
     values ('00000000-0000-0000-0000-0000000000a1', 'https://push.example/forged', 'x', 'y') $$,
  '42501',
  null,
  'B cannot register a device as A'
);

-- B CAN manage B's own row.
insert into public.push_subscriptions (user_id, endpoint, p256dh, auth)
  values ('00000000-0000-0000-0000-0000000000b1', 'https://push.example/b-device', 'pB', 'aB');
select is(
  (select count(*) from public.push_subscriptions)::int,
  1,
  'B can register and see B''s own device'
);

-- ── Back to superuser to verify B's update/delete of A's row did nothing ──
reset role;
select is(
  (select p256dh from public.push_subscriptions where endpoint = 'https://push.example/a-device'),
  'pA',
  'B''s update/delete attempts left A''s row untouched'
);

-- ── anon ──
set local role anon;
select throws_ok(
  $$ select count(*) from public.push_subscriptions $$,
  '42501',
  null,
  'anon has no access to push_subscriptions'
);

select * from finish();
rollback;
