-- Harden save_log_entry against silent homeschool data loss.
--
-- Background (2026-07-05): a lint-driven rename (`children` -> `childList`) changed the
-- KEY of the homeschool child array in the client payload. This RPC iterates
-- `hs->'children'`; with the key renamed it read NULL, `jsonb_array_elements(NULL)`
-- produced zero rows, and the ENTIRE school record (daily_log + attendance) was dropped
-- while the RPC still returned void and the UI still said "Logged." Pure silent data loss.
--
-- The client key is fixed. This migration adds defense-in-depth so the WHOLE CLASS can't
-- recur silently: if a homeschool block is present but carries no children, fail loudly and
-- roll the atomic save back, surfacing an error instead of throwing the record away. The
-- client only ever emits a homeschool block when >=1 child is targeted, so this never fires
-- on a legitimate save — it only trips on payload/key drift, which is exactly what we want
-- to catch. Everything else in the function is unchanged from the live definition.

CREATE OR REPLACE FUNCTION public.save_log_entry(p_log_date date, p_photo_urls text[], p_events jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  ev jsonb; hs jsonb; hm jsonb; hd jsonb; pr jsonb; child jsonb;
  v_child_id uuid; v_school_year uuid; v_subject_ids uuid[]; subj text;
  v_sid uuid; v_active boolean; v_notes text;
  v_equip_name text; v_eid uuid; v_interval int; v_next date;
  v_credit uuid[];
  v_subject_hours jsonb; v_sh numeric;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;

  FOR ev IN SELECT value FROM jsonb_array_elements(p_events) LOOP
    v_notes := ev->>'notes';

    -- ── HOMESCHOOL ──
    hs := ev->'homeschool';
    IF hs IS NOT NULL AND hs <> 'null'::jsonb THEN
      -- Fail loud instead of silently dropping: a homeschool event must carry a non-empty
      -- `children` array. A missing/renamed key (payload drift) is a bug, not an empty save.
      IF hs->'children' IS NULL OR jsonb_array_length(hs->'children') = 0 THEN
        RAISE EXCEPTION 'save_log_entry: homeschool event has no children — payload key drift? Expected hs->''children''. notes=%', v_notes;
      END IF;
      FOR child IN SELECT value FROM jsonb_array_elements(hs->'children') LOOP
        v_child_id := (child->>'child_id')::uuid;
        v_school_year := NULLIF(child->>'school_year_id','')::uuid;
        v_subject_ids := '{}';
        v_subject_hours := '{}'::jsonb;

        FOR subj IN SELECT value FROM jsonb_array_elements_text(hs->'subjects') LOOP
          SELECT s.id, s.is_active INTO v_sid, v_active
          FROM public.subjects s
          WHERE s.child_id = v_child_id AND lower(trim(s.name)) = lower(trim(subj))
          LIMIT 1;

          IF v_sid IS NOT NULL THEN
            IF v_active IS DISTINCT FROM true THEN
              UPDATE public.subjects SET is_active = true WHERE id = v_sid;
            END IF;
          ELSE
            INSERT INTO public.subjects (user_id, child_id, name, school_year_id)
            VALUES (v_uid, v_child_id, trim(subj), v_school_year)
            RETURNING id INTO v_sid;
          END IF;
          v_subject_ids := array_append(v_subject_ids, v_sid);

          -- Per-subject hours (keyed by subject_id) for exact compliance reporting.
          -- Client sends hs->'subject_hours' as { "<subject name>": <hours> }. Missing/blank
          -- leaves the entry out of the map (no fabricated split).
          v_sh := NULLIF(hs->'subject_hours'->>subj, '')::numeric;
          IF v_sh IS NOT NULL AND v_sh >= 0 THEN
            v_subject_hours := v_subject_hours || jsonb_build_object(v_sid::text, v_sh);
          END IF;
        END LOOP;

        INSERT INTO public.daily_log
          (user_id, child_id, school_year_id, log_date, notes, hours, subject_ids, subject_hours, is_homestead_day, photo_urls)
        VALUES
          (v_uid, v_child_id, v_school_year, p_log_date, v_notes,
           NULLIF(hs->>'hours','')::numeric, v_subject_ids, v_subject_hours,
           COALESCE((ev->>'is_homestead_day')::boolean, false), COALESCE(p_photo_urls, '{}'));

        INSERT INTO public.attendance (user_id, child_id, school_year_id, attendance_date, status)
        VALUES (v_uid, v_child_id, v_school_year, p_log_date, 'present')
        ON CONFLICT (child_id, attendance_date)
        DO UPDATE SET status = 'present', school_year_id = EXCLUDED.school_year_id;
      END LOOP;
    END IF;

    -- ── HOMESTEAD ──
    hm := ev->'homestead';
    IF hm IS NOT NULL AND hm <> 'null'::jsonb THEN
      v_credit := COALESCE((SELECT array_agg(x::uuid) FROM jsonb_array_elements_text(hm->'credit_child_ids') x), '{}');
      IF (hm->>'sub_module') IN ('livestock','general') THEN
        INSERT INTO public.livestock_logs
          (user_id, log_date, animal_type, animal_name, quantity, unit, notes, school_credit, child_ids, subject_ids, credit_hours, disposition, sale_amount, sale_qty)
        VALUES
          (v_uid, p_log_date, COALESCE(NULLIF(hm->>'animal_type',''),'General'), NULL,
           NULLIF(hm->>'quantity','')::numeric, NULLIF(hm->>'unit',''), v_notes,
           COALESCE((hm->>'school_credit')::boolean,false), v_credit, '{}', NULL,
           NULLIF(hm->>'disposition',''), NULLIF(hm->>'sale_amount','')::numeric, NULL);
      ELSIF (hm->>'sub_module') = 'garden' THEN
        INSERT INTO public.garden_entries
          (user_id, crop_name, status, date_planted, notes, school_credit, child_ids, subject_ids, credit_hours)
        VALUES
          (v_uid, COALESCE(NULLIF(hm->>'crop_name',''),'Garden crop'),
           COALESCE(NULLIF(hm->>'garden_status',''),'planted'), p_log_date,
           NULLIF(hm->>'garden_notes',''), COALESCE((hm->>'school_credit')::boolean,false),
           v_credit, '{}', NULL);
      ELSIF (hm->>'sub_module') = 'preservation' THEN
        INSERT INTO public.preservation_logs
          (user_id, log_date, item_name, method, quantity, unit, notes, school_credit, child_ids, subject_ids, credit_hours)
        VALUES
          (v_uid, p_log_date, COALESCE(NULLIF(hm->>'item_name',''),'Preserved item'),
           COALESCE(NULLIF(hm->>'method',''),'other'), NULLIF(hm->>'quantity','')::numeric,
           NULLIF(hm->>'unit',''), v_notes, COALESCE((hm->>'school_credit')::boolean,false),
           v_credit, '{}', NULL);
      END IF;
    END IF;

    -- ── HOME & DIY ──
    hd := ev->'home_diy';
    IF hd IS NOT NULL AND hd <> 'null'::jsonb THEN
      v_equip_name := trim(hd->>'equipment_name');
      IF v_equip_name <> '' THEN
        SELECT e.id, e.service_interval_days INTO v_eid, v_interval
        FROM public.equipment_maintenance e
        WHERE e.user_id = v_uid AND e.is_active = true
          AND e.equipment_name ILIKE '%'||v_equip_name||'%'
        LIMIT 1;

        IF v_eid IS NOT NULL THEN
          v_next := CASE WHEN v_interval IS NOT NULL THEN CURRENT_DATE + v_interval ELSE NULL END;
          UPDATE public.equipment_maintenance
          SET last_service_date = p_log_date, next_service_date = v_next, service_notes = v_notes, updated_at = now()
          WHERE id = v_eid;
        ELSE
          v_interval := NULLIF(hd->>'interval_days','')::int;
          IF v_interval IS NOT NULL AND v_interval <= 0 THEN v_interval := NULL; END IF;
          v_next := CASE WHEN v_interval IS NOT NULL THEN CURRENT_DATE + v_interval ELSE NULL END;
          INSERT INTO public.equipment_maintenance
            (user_id, equipment_name, category, equipment_category, service_interval_days, last_service_date, next_service_date, service_notes, is_active)
          VALUES
            (v_uid, v_equip_name, COALESCE(NULLIF(hd->>'category',''),'other'), 'home',
             v_interval, p_log_date, v_next, v_notes, true);
        END IF;
      END IF;
    END IF;

    -- ── PROJECTS ──
    pr := ev->'project';
    IF pr IS NOT NULL AND pr <> 'null'::jsonb THEN
      IF COALESCE(trim(pr->>'title'),'') <> '' AND NULLIF(pr->>'project_id','') IS NOT NULL THEN
        INSERT INTO public.project_tasks (user_id, project_id, title, is_complete, sort_order)
        VALUES (v_uid, (pr->>'project_id')::uuid, trim(pr->>'title'), COALESCE((pr->>'is_complete')::boolean,false), 0);
      END IF;
    END IF;
  END LOOP;
END;
$function$;
