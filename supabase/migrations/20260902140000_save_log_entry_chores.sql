-- save_log_entry: persist a CHORE COMPLETION inside the same transaction as the day.
--
-- THE GAP: Chores is a card on Household but had no path through the universal log. The router
-- explicitly excluded chores from BOTH destinations -- from projects ("when the event is a chore
-- rather than construction, set modules.projects = false") and from homestead ("cleaning
-- pens/coops, feeding animals, general chores is NOT a homestead record"). They fell through
-- every branch by design, with nothing built to catch them.
--
-- WHY IN THIS FUNCTION rather than a client-side insert beside it: save_log_entry exists so a
-- multi-table, multi-event save cannot leave partial state. A chore completion writes
-- chore_completions AND advances homestead_chores.next_due_date. Split across two round trips, a
-- failure between them leaves either a logged day whose chore never completed, or a chore
-- advanced with no completion behind it.
--
-- WHY next_due_date IS PASSED IN rather than computed here: the cadence rule (interval vs weekly)
-- already exists once, in lib/chores.ts nextDueDate(). Reimplementing it in PL/pgSQL would put a
-- single business rule in two languages, in two repos' worth of review, guaranteed to drift. The
-- client computes it with the one existing implementation and hands over the result. This
-- function is a transactional writer, not a rules engine.
--
-- WHY THIS PATCHES THE LIVE DEFINITION instead of re-issuing the whole function, following
-- 20260805150000: save_log_entry has been extended by successive migrations, and at least one of
-- those (the attendance source='log' fix) was itself a splice. So NO single migration file holds
-- the current body. Regenerating the function from the newest full-text migration
-- (20260709200100) would silently REVERT the August attendance fix -- which is exactly what the
-- first draft of this migration did before the size mismatch between the file (13,363 chars) and
-- the live definition (11,674) gave it away. Splice, verify, never assume a file is current.

DO $patch$
DECLARE
  d text;
  decl_old text := $old$  v_disp text; v_sale_amt numeric; v_sale_qty numeric;$old$;
  decl_new text := $new$  v_disp text; v_sale_amt numeric; v_sale_qty numeric;
  ch jsonb; v_chore_id uuid; v_chore_owned uuid;
  v_ch_children uuid[]; v_ch_subjects uuid[];$new$;
  tail_old text := $old$      END IF;
    END IF;
  END LOOP;
END;$old$;
  tail_new text := $new$      END IF;
    END IF;

    -- CHORES. A completion must reference a chore the user ALREADY defined:
    -- chore_completions.chore_id is NOT NULL, and inventing a recurring chore from one
    -- sentence would hand the family a job that comes due forever.
    --
    -- next_due_date is PASSED IN, not computed here. The cadence rule lives once, in
    -- lib/chores.ts nextDueDate(). Reimplementing it in PL/pgSQL would put one business
    -- rule in two languages. This function is a transactional writer, not a rules engine.
    ch := ev->'chore';
    IF ch IS NOT NULL AND ch <> 'null'::jsonb THEN
      v_chore_id := NULLIF(ch->>'chore_id','')::uuid;

      IF v_chore_id IS NOT NULL THEN
        SELECT c.id INTO v_chore_owned
        FROM public.homestead_chores c
        WHERE c.id = v_chore_id AND c.user_id = v_uid AND c.is_active
        LIMIT 1;

        IF v_chore_owned IS NOT NULL THEN
          SELECT COALESCE(array_agg(value::uuid), '{}')
            INTO v_ch_children
            FROM jsonb_array_elements_text(COALESCE(ch->'child_ids', '[]'::jsonb));

          SELECT COALESCE(array_agg(value::uuid), '{}')
            INTO v_ch_subjects
            FROM jsonb_array_elements_text(COALESCE(ch->'subject_ids', '[]'::jsonb));

          -- Idempotent: at most one completion per chore per date. A retried save must not
          -- insert twice AND must not advance the schedule twice, which would push a daily
          -- chore a week into the future.
          INSERT INTO public.chore_completions
            (user_id, chore_id, completed_date, school_credit, child_ids, subject_ids, credit_hours)
          SELECT v_uid, v_chore_id, p_log_date,
                 COALESCE((ch->>'school_credit')::boolean, false),
                 v_ch_children, v_ch_subjects,
                 NULLIF(ch->>'credit_hours','')::numeric
          WHERE NOT EXISTS (
            SELECT 1 FROM public.chore_completions x
            WHERE x.chore_id = v_chore_id AND x.completed_date = p_log_date
          );

          IF FOUND THEN
            UPDATE public.homestead_chores
            SET last_completed_date = p_log_date,
                next_due_date = COALESCE(NULLIF(ch->>'next_due_date','')::date, next_due_date),
                updated_at = now()
            WHERE id = v_chore_id;
          END IF;
        END IF;
      END IF;
    END IF;
  END LOOP;
END;$new$;
BEGIN
  SELECT pg_get_functiondef(p.oid) INTO d
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = 'save_log_entry';

  IF d IS NULL THEN
    RAISE EXCEPTION 'save_log_entry not found -- refusing to continue';
  END IF;

  -- Idempotent migration: if the chores branch is already present, this is a replay. Do nothing
  -- rather than splicing a second copy in.
  IF position('-- CHORES. A completion must reference' IN d) > 0 THEN
    RAISE NOTICE 'save_log_entry already has the chores branch -- nothing to do.';
    RETURN;
  END IF;

  IF position(decl_old IN d) = 0 THEN
    RAISE EXCEPTION 'save_log_entry DECLARE block not found -- it changed shape. '
                    'Re-read the function and update this migration rather than guessing.';
  END IF;
  IF position(tail_old IN d) = 0 THEN
    RAISE EXCEPTION 'save_log_entry event-loop tail not found -- it changed shape. '
                    'Re-read the function and update this migration rather than guessing.';
  END IF;

  d := replace(d, decl_old, decl_new);
  d := replace(d, tail_old, tail_new);

  IF position('chore_completions' IN d) = 0 THEN
    RAISE EXCEPTION 'chores branch did not splice in -- refusing to install a no-op';
  END IF;

  EXECUTE d;
END
$patch$;
