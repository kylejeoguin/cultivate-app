-- Per-section reminder toggles.
--
-- `enabled` stays the MASTER switch and keeps its opt-in default of false -- nobody is
-- ever enrolled without asking. These three are the finer control underneath it, and
-- they default TRUE so that opting in gives you everything and you narrow from there,
-- rather than opting in and receiving silence.
--
-- Why per-SECTION and not per-item: the digest already groups by the three surfaces the
-- app actually has (school log, homestead chores, equipment servicing -- see
-- src/lib/notifications/decide.ts). A toggle per surface is the smallest control that
-- lets someone silence a whole category they don't use without abandoning the channel.
--
-- ⚠️ This table is deliberately PER PERSON, not household-normalized, and must never be
-- added to the household-normalization trigger array: that trigger rewrites user_id to
-- the plan owner, which would collapse both parents on a Family plan onto one row so
-- only one of them would ever be notified.

alter table public.notification_prefs
  add column if not exists school_enabled    boolean not null default true,
  add column if not exists chores_enabled    boolean not null default true,
  add column if not exists equipment_enabled boolean not null default true;

comment on column public.notification_prefs.school_enabled is
  'Include the "you haven''t logged school" nudge in this person''s digest.';
comment on column public.notification_prefs.chores_enabled is
  'Include due/overdue homestead chores in this person''s digest.';
comment on column public.notification_prefs.equipment_enabled is
  'Include due/overdue equipment servicing in this person''s digest.';
