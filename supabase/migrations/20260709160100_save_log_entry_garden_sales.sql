-- save_log_entry: the garden branch now persists a sale (disposition / sale_amount / sale_qty).
--
-- Companion to 20260709160000_garden_sales.sql. Before this, the garden branch read only
-- crop/qty/unit/notes — a parsed "sold 10 lbs of tomatoes for $20" reached the RPC with
-- sale_amount in the payload and the function dropped it on the floor.
--
-- Applied to all THREE harvest paths (explicit target, bind-to-open-planting, orphan insert),
-- because a sale can arrive through any of them. NOT applied to the planting path: you cannot
-- sell a crop that is still in the ground, and the DB now enforces that too
-- (garden_entries_sale_needs_harvest).
--
-- Everything outside the garden branch is byte-identical to 20260709120000.

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
  v_crop text; v_target uuid; v_is_harvest boolean; v_qty numeric; v_unit text;
  v_garden_event text;
  v_disp text; v_sale_amt numeric; v_sale_qty numeric;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;

  FOR ev IN SELECT value FROM jsonb_array_elements(p_events) LOOP
    v_notes := ev->>'notes';

    -- ── HOMESCHOOL ──
    hs := ev->'homeschool';
    IF hs IS NOT NULL AND hs <> 'null'::jsonb THEN
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
        v_crop   := COALESCE(NULLIF(hm->>'crop_name',''),'Garden crop');
        v_qty    := NULLIF(hm->>'quantity','')::numeric;
        v_unit   := NULLIF(hm->>'unit','');
        v_target := NULLIF(hm->>'garden_entry_id','')::uuid;
        v_garden_event := NULLIF(hm->>'garden_event','');
        v_disp     := NULLIF(hm->>'disposition','');
        v_sale_amt := NULLIF(hm->>'sale_amount','')::numeric;
        v_sale_qty := NULLIF(hm->>'sale_qty','')::numeric;

        -- TENDING: real work, no lifecycle row. Skip the entire garden branch. An explicit
        -- garden_entry_id does NOT override this — "weeded bed X" is still not a harvest of X.
        IF v_garden_event = 'tending' THEN
          NULL;

        ELSE
          -- Explicit stage wins. Absent it, fall back to the pre-P2b garden_status reading so a
          -- stale client mid-deploy keeps working. (A stale client can still send a quantity-less
          -- planting; it can no longer be sent by the current one.)
          v_is_harvest := CASE
            WHEN v_garden_event IS NOT NULL THEN v_garden_event = 'harvest'
            ELSE COALESCE(NULLIF(hm->>'garden_status',''),'planted') = 'harvested'
          END;

          IF v_target IS NOT NULL THEN
            -- (1) Explicit target from the QuickLog. Ownership is enforced in the predicate.
            UPDATE public.garden_entries
            SET status         = 'harvested',
                actual_harvest = p_log_date,
                quantity       = COALESCE(v_qty, quantity),
                unit           = COALESCE(v_unit, unit),
                notes          = COALESCE(NULLIF(hm->>'garden_notes',''), notes),
                disposition    = COALESCE(v_disp, disposition),
                sale_amount    = COALESCE(v_sale_amt, sale_amount),
                sale_qty       = COALESCE(v_sale_qty, sale_qty),
                school_credit  = COALESCE((hm->>'school_credit')::boolean, school_credit),
                child_ids      = CASE WHEN COALESCE((hm->>'school_credit')::boolean,false) THEN v_credit ELSE child_ids END,
                subject_ids    = CASE WHEN COALESCE((hm->>'school_credit')::boolean,false) THEN v_hm_subjects ELSE subject_ids END,
                credit_hours   = COALESCE(v_hm_hours, credit_hours),
                updated_at     = now()
            WHERE id = v_target AND user_id = v_uid;

            -- Fail loud: a targeted harvest that hits nothing is a bug (bad id, or someone
            -- else's row), not an empty save. Never fall through to an INSERT here — that is
            -- exactly how the duplicate-row problem was born.
            IF NOT FOUND THEN
              RAISE EXCEPTION 'save_log_entry: garden_entry_id % not found for this user', v_target;
            END IF;

          ELSIF v_is_harvest THEN
            -- (2) Bind to this user's most recent OPEN planting of the same crop.
            SELECT g.id INTO v_target
            FROM public.garden_entries g
            WHERE g.user_id = v_uid
              AND lower(trim(g.crop_name)) = lower(trim(v_crop))
              AND g.status IN ('planted','growing')
            ORDER BY g.date_planted DESC NULLS LAST
            LIMIT 1;

            IF v_target IS NOT NULL THEN
              UPDATE public.garden_entries
              SET status         = 'harvested',
                  actual_harvest = p_log_date,
                  quantity       = COALESCE(v_qty, quantity),
                  unit           = COALESCE(v_unit, unit),
                  notes          = COALESCE(NULLIF(hm->>'garden_notes',''), notes),
                  disposition    = COALESCE(v_disp, disposition),
                  sale_amount    = COALESCE(v_sale_amt, sale_amount),
                  sale_qty       = COALESCE(v_sale_qty, sale_qty),
                  school_credit  = COALESCE((hm->>'school_credit')::boolean, school_credit),
                  child_ids      = CASE WHEN COALESCE((hm->>'school_credit')::boolean,false) THEN v_credit ELSE child_ids END,
                  subject_ids    = CASE WHEN COALESCE((hm->>'school_credit')::boolean,false) THEN v_hm_subjects ELSE subject_ids END,
                  credit_hours   = COALESCE(v_hm_hours, credit_hours),
                  updated_at     = now()
              WHERE id = v_target AND user_id = v_uid;
            ELSE
              -- (3) Nothing open to bind to. Record the harvest honestly: we know WHEN it was
              -- picked, we do not know when it was planted. date_planted stays NULL.
              INSERT INTO public.garden_entries
                (user_id, crop_name, status, date_planted, actual_harvest, quantity, unit, notes,
                 project_id, school_credit, child_ids, subject_ids, credit_hours,
                 disposition, sale_amount, sale_qty)
              VALUES
                (v_uid, v_crop, 'harvested', NULL, p_log_date, v_qty, v_unit,
                 NULLIF(hm->>'garden_notes',''), NULLIF(hm->>'project_id','')::uuid,
                 COALESCE((hm->>'school_credit')::boolean,false), v_credit, v_hm_subjects, v_hm_hours,
                 v_disp, v_sale_amt, v_sale_qty);
            END IF;

          ELSE
            -- (4) A planting. Quantity is deliberately NOT written: on a planting it counts
            -- seedlings, and garden_entries.quantity means YIELD. Storing it here would
            -- fabricate a harvest the family never made. Sale columns likewise stay NULL —
            -- nothing has been picked yet, and the DB enforces that (sale_needs_harvest).
            -- An explicit garden_event='planting' always means status 'planted'; without one we
            -- still honor a caller-supplied garden_status (e.g. 'growing'), as before.
            INSERT INTO public.garden_entries
              (user_id, crop_name, status, date_planted, notes, project_id,
               school_credit, child_ids, subject_ids, credit_hours)
            VALUES
              (v_uid, v_crop,
               CASE WHEN v_garden_event = 'planting' THEN 'planted'
                    ELSE COALESCE(NULLIF(hm->>'garden_status',''),'planted') END,
               p_log_date,
               NULLIF(hm->>'garden_notes',''), NULLIF(hm->>'project_id','')::uuid,
               COALESCE((hm->>'school_credit')::boolean,false),
               v_credit, v_hm_subjects, v_hm_hours);
          END IF;
        END IF;

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
