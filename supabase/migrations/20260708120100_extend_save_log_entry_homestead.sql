-- Make save_log_entry the ONE write path for homestead production.
--
-- Background (2026-07-08): the homestead QuickLog (shared quick-add on each section page)
-- must write the same tables through the same path as the AI log — "two entry points, one
-- data path". But the RPC's homestead block hardcoded `subject_ids = '{}'` and
-- `credit_hours = NULL`, and had no way to carry animal_id / animal_name / project_id /
-- sale_qty. Routing the QuickLog through it as-written would mean a user checks
-- "counts as school", types 1.5 hours, sees "Logged ✓" — and homeschool/reports adds 0h,
-- because it sums livestock_logs.credit_hours (reports/page.tsx: dailyHours +
-- homesteadCreditHours). That is exactly the silent-zero failure mode we test against.
--
-- This change is purely ADDITIVE. The AI log's existing payloads never emit these keys, so
-- every new expression resolves to the same value the old function hardcoded:
--   subject_ids  -> COALESCE(NULL, '{}')      = '{}'    (unchanged)
--   credit_hours -> NULLIF('','')::numeric    = NULL    (unchanged)
--   animal_id / animal_name / project_id / sale_qty -> NULL (unchanged)
-- Everything outside the homestead block is byte-identical to 20260705120000.

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
  v_hm_subjects uuid[]; v_hm_hours numeric;
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

      -- NEW: structured school-credit carried by the QuickLog. The AI log omits both keys,
      -- so these resolve to '{}' / NULL — byte-identical to the previous hardcoded values.
      -- Hours here are what homeschool/reports + transcript sum as "Homestead Credit"; the
      -- AI log instead routes its hours through the homeschool block into daily_log, so the
      -- two mechanisms stay mutually exclusive per event and never double-count.
      v_hm_subjects := COALESCE((SELECT array_agg(x::uuid) FROM jsonb_array_elements_text(hm->'subject_ids') x), '{}');
      v_hm_hours := NULLIF(hm->>'credit_hours','')::numeric;

      IF (hm->>'sub_module') IN ('livestock','general') THEN
        INSERT INTO public.livestock_logs
          (user_id, log_date, animal_type, animal_name, animal_id, project_id, quantity, unit, notes,
           school_credit, child_ids, subject_ids, credit_hours, disposition, sale_amount, sale_qty)
        VALUES
          (v_uid, p_log_date, COALESCE(NULLIF(hm->>'animal_type',''),'General'),
           NULLIF(hm->>'animal_name',''), NULLIF(hm->>'animal_id','')::uuid,
           NULLIF(hm->>'project_id','')::uuid,
           NULLIF(hm->>'quantity','')::numeric, NULLIF(hm->>'unit',''), v_notes,
           COALESCE((hm->>'school_credit')::boolean,false), v_credit, v_hm_subjects, v_hm_hours,
           NULLIF(hm->>'disposition',''), NULLIF(hm->>'sale_amount','')::numeric,
           NULLIF(hm->>'sale_qty','')::numeric);
      ELSIF (hm->>'sub_module') = 'garden' THEN
        INSERT INTO public.garden_entries
          (user_id, crop_name, status, date_planted, notes, project_id,
           school_credit, child_ids, subject_ids, credit_hours)
        VALUES
          (v_uid, COALESCE(NULLIF(hm->>'crop_name',''),'Garden crop'),
           COALESCE(NULLIF(hm->>'garden_status',''),'planted'), p_log_date,
           NULLIF(hm->>'garden_notes',''), NULLIF(hm->>'project_id','')::uuid,
           COALESCE((hm->>'school_credit')::boolean,false),
           v_credit, v_hm_subjects, v_hm_hours);
      ELSIF (hm->>'sub_module') = 'preservation' THEN
        INSERT INTO public.preservation_logs
          (user_id, log_date, item_name, method, quantity, unit, notes,
           school_credit, child_ids, subject_ids, credit_hours)
        VALUES
          (v_uid, p_log_date, COALESCE(NULLIF(hm->>'item_name',''),'Preserved item'),
           COALESCE(NULLIF(hm->>'method',''),'other'), NULLIF(hm->>'quantity','')::numeric,
           NULLIF(hm->>'unit',''), v_notes, COALESCE((hm->>'school_credit')::boolean,false),
           v_credit, v_hm_subjects, v_hm_hours);
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
