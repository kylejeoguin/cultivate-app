-- Deleting a school log left the child still marked PRESENT.  (found 2026-08-04, fixed 2026-08-05)
--
-- THE BUG: save_log_entry() writes daily_log AND upserts attendance='present'. But `attendance`
-- has no FK to daily_log and no cascade, and the app's deleteLog() removes only the daily_log
-- row. So deleting a school entry left an attendance record asserting the child was present --
-- stale data on the artifact most likely handed to a state EVALUATOR. Measured before the fix:
-- 2 orphaned rows in real user data, 47 in the seeded demo account.
--
-- ⭐ WHY THIS ISN'T JUST "DELETE THE ATTENDANCE ROW TOO":
-- Attendance has TWO writers -- save_log_entry (automatic) and the attendance calendar, where a
-- parent marks a day by hand (AttendanceClient.tsx can insert, update AND delete). Nothing
-- recorded WHICH created a given row. Blindly clearing attendance on log deletion would destroy
-- deliberate manual marks -- a worse bug than the one being fixed, and a silent one.
--
-- ⇒ Record provenance, then only ever clean up what the LOG itself created.

-- 1. Provenance. Default 'manual' is the SAFE default: anything we can't attribute is treated as
--    a human decision and never auto-deleted.
alter table public.attendance
  add column if not exists source text not null default 'manual';

alter table public.attendance
  drop constraint if exists attendance_source_check;
alter table public.attendance
  add constraint attendance_source_check check (source in ('log', 'manual'));

-- 2. Backfill by inference -- the only evidence available. A row with a matching daily_log was
--    almost certainly log-created (and is at minimum corroborated by one). A row WITHOUT one is
--    either a genuine manual mark or already-orphaned damage; we cannot tell them apart, so both
--    stay 'manual' and are preserved. Deleting real attendance records to tidy up would be the
--    wrong trade on a compliance artifact.
update public.attendance a
   set source = 'log'
 where a.source = 'manual'
   and exists (
     select 1 from public.daily_log d
      where d.child_id = a.child_id
        and d.log_date = a.attendance_date
   );

-- 3. Teach save_log_entry to stamp source='log'.
--    Patched in place rather than restated: the function is ~11.6 KB and has already been
--    superseded by six migrations, so retyping it invites a transcription error in code that
--    writes compliance records. The guard makes a missed pattern LOUD instead of a silent no-op.
DO $patch$
DECLARE
  d   text;
  old text := $old$        INSERT INTO public.attendance (user_id, child_id, school_year_id, attendance_date, status)
        VALUES (v_uid, v_child_id, v_school_year, p_log_date, 'present')
        ON CONFLICT (child_id, attendance_date)
        DO UPDATE SET status = 'present', school_year_id = EXCLUDED.school_year_id;$old$;
  new text := $new$        INSERT INTO public.attendance (user_id, child_id, school_year_id, attendance_date, status, source)
        VALUES (v_uid, v_child_id, v_school_year, p_log_date, 'present', 'log')
        ON CONFLICT (child_id, attendance_date)
        DO UPDATE SET status = 'present', school_year_id = EXCLUDED.school_year_id;$new$;
BEGIN
  SELECT pg_get_functiondef(p.oid) INTO d
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = 'save_log_entry';

  IF d IS NULL THEN
    RAISE EXCEPTION 'save_log_entry not found -- refusing to continue';
  END IF;
  IF position(old IN d) = 0 THEN
    RAISE EXCEPTION 'save_log_entry attendance block not found -- it changed shape. '
                    'Re-read the function and update this migration rather than guessing.';
  END IF;

  EXECUTE replace(d, old, new);
END
$patch$;

-- NOTE on the ON CONFLICT above: `source` is deliberately NOT updated. If a parent marked the day
-- by hand and later logs it, the row stays 'manual' and survives a later log deletion -- their
-- decision outranks our inference.

-- 4. Clear only log-created attendance, and only when no other log still supports that day.
--    SECURITY INVOKER (the default) on purpose: the caller is deleting their own household's log,
--    and the attendance RLS policy already scopes them to their own household. Least privilege --
--    a SECURITY DEFINER here would bypass RLS for no benefit.
create or replace function public.clear_log_attendance()
returns trigger
language plpgsql
set search_path to ''
as $$
begin
  delete from public.attendance a
   where a.child_id        = OLD.child_id
     and a.attendance_date = OLD.log_date
     and a.source          = 'log'
     and not exists (
       select 1 from public.daily_log d
        where d.child_id = OLD.child_id
          and d.log_date = OLD.log_date
          and d.id      <> OLD.id
     );
  return OLD;
end
$$;

drop trigger if exists trg_clear_log_attendance on public.daily_log;
create trigger trg_clear_log_attendance
  after delete on public.daily_log
  for each row execute function public.clear_log_attendance();
