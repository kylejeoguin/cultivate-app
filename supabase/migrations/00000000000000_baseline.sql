


-- ============================================================================
-- CI/LOCAL SCHEMA BASELINE — generated 2026-06-30 via `supabase db dump --schema public`
-- against the prod project for ONE purpose: to spin up an
-- ephemeral local Postgres in CI / `supabase start` so the pgTAP RLS isolation test
-- (supabase/tests/database/rls_isolation.test.sql) has a schema to run against.
--
-- ⚠️  PROD IS **NOT** MANAGED BY THESE MIGRATIONS. Schema changes are made directly
--     (dashboard / MCP). DO NOT `supabase db push` this — policies use bare CREATE
--     POLICY and would error on re-apply. Regenerate this file if the prod schema drifts.
-- ============================================================================
SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;


CREATE SCHEMA IF NOT EXISTS "public";


ALTER SCHEMA "public" OWNER TO "pg_database_owner";


COMMENT ON SCHEMA "public" IS 'standard public schema';



CREATE OR REPLACE FUNCTION "public"."is_family_authorized"("owner_id" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
  SELECT auth.uid() = owner_id
  OR EXISTS (
    SELECT 1 FROM public.family_members fm
    WHERE fm.owner_id = owner_id
    AND fm.member_id = auth.uid()
    AND fm.status = 'accepted'
  )
$$;


ALTER FUNCTION "public"."is_family_authorized"("owner_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."save_log_entry"("p_log_date" "date", "p_photo_urls" "text"[], "p_events" "jsonb") RETURNS "void"
    LANGUAGE "plpgsql"
    SET "search_path" TO ''
    AS $$
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
$$;


ALTER FUNCTION "public"."save_log_entry"("p_log_date" "date", "p_photo_urls" "text"[], "p_events" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_updated_at_column"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO ''
    AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."update_updated_at_column"() OWNER TO "postgres";

SET default_tablespace = '';

SET default_table_access_method = "heap";


CREATE TABLE IF NOT EXISTS "public"."activities" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "child_id" "uuid" NOT NULL,
    "school_year_id" "uuid",
    "activity_date" "date" DEFAULT CURRENT_DATE NOT NULL,
    "type" "text",
    "title" "text" NOT NULL,
    "description" "text",
    "hours" numeric(4,2),
    "subject_ids" "uuid"[],
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "activities_type_check" CHECK (("type" = ANY (ARRAY['field_trip'::"text", 'co_op'::"text", 'community_service'::"text", 'extracurricular'::"text", 'other'::"text"])))
);


ALTER TABLE "public"."activities" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."assessment_logs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "child_id" "uuid" NOT NULL,
    "assessment_date" "date" NOT NULL,
    "type" "text" NOT NULL,
    "title" "text" NOT NULL,
    "administered_by" "text",
    "results" "text",
    "notes" "text",
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."assessment_logs" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."attendance" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "child_id" "uuid" NOT NULL,
    "school_year_id" "uuid",
    "attendance_date" "date" NOT NULL,
    "status" "text" DEFAULT 'present'::"text" NOT NULL,
    "notes" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "attendance_status_check" CHECK (("status" = ANY (ARRAY['present'::"text", 'absent'::"text", 'excused'::"text"])))
);


ALTER TABLE "public"."attendance" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."beta_users" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "email" "text"
);


ALTER TABLE "public"."beta_users" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."children" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "birthdate" "date",
    "grade_level" "text",
    "learning_style" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "color" "text" DEFAULT 'green'::"text",
    "learning_support" "text"[] DEFAULT '{}'::"text"[],
    "ai_notes" "text",
    CONSTRAINT "children_learning_style_check" CHECK (("learning_style" = ANY (ARRAY['structured'::"text", 'charlotte_mason'::"text", 'unschooling'::"text", 'project_based'::"text", 'eclectic'::"text"])))
);


ALTER TABLE "public"."children" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."curriculum_plans" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "child_id" "uuid" NOT NULL,
    "school_year_id" "uuid",
    "subject_id" "uuid" NOT NULL,
    "program_name" "text",
    "goals" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."curriculum_plans" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."curriculum_units" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "plan_id" "uuid" NOT NULL,
    "title" "text" NOT NULL,
    "sequence" integer DEFAULT 0,
    "status" "text" DEFAULT 'planned'::"text" NOT NULL,
    "target_date" "date",
    "notes" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."curriculum_units" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."daily_log" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "child_id" "uuid" NOT NULL,
    "school_year_id" "uuid",
    "log_date" "date" DEFAULT CURRENT_DATE NOT NULL,
    "notes" "text",
    "hours" numeric(4,2),
    "subject_ids" "uuid"[],
    "is_homestead_day" boolean DEFAULT false,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "subject_hours" "jsonb" DEFAULT '{}'::"jsonb",
    "photo_urls" "text"[] DEFAULT '{}'::"text"[]
);


ALTER TABLE "public"."daily_log" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."equipment_maintenance" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "equipment_name" "text" NOT NULL,
    "category" "text" DEFAULT 'other'::"text" NOT NULL,
    "last_service_date" "date",
    "next_service_date" "date",
    "service_interval_days" integer,
    "service_notes" "text",
    "purchase_date" "date",
    "location" "text",
    "is_active" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "equipment_category" "text" DEFAULT 'home'::"text" NOT NULL,
    CONSTRAINT "equipment_maintenance_equipment_category_check" CHECK (("equipment_category" = ANY (ARRAY['home'::"text", 'homestead'::"text"])))
);


ALTER TABLE "public"."equipment_maintenance" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."family_members" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "owner_id" "uuid" NOT NULL,
    "member_id" "uuid",
    "member_email" "text" NOT NULL,
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "invite_token" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "accepted_at" timestamp with time zone
);


ALTER TABLE "public"."family_members" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."garden_beds" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "notes" "text",
    "is_active" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."garden_beds" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."garden_entries" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "crop_name" "text" NOT NULL,
    "variety" "text",
    "zone" "text",
    "date_planted" "date",
    "expected_harvest" "date",
    "actual_harvest" "date",
    "status" "text" DEFAULT 'planned'::"text" NOT NULL,
    "notes" "text",
    "school_credit" boolean DEFAULT false NOT NULL,
    "child_ids" "uuid"[] DEFAULT '{}'::"uuid"[] NOT NULL,
    "subject_ids" "uuid"[] DEFAULT '{}'::"uuid"[] NOT NULL,
    "credit_hours" numeric,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "project_id" "uuid",
    "bed_id" "uuid"
);


ALTER TABLE "public"."garden_entries" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."grades" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "subject_id" "uuid" NOT NULL,
    "child_id" "uuid" NOT NULL,
    "period" "text",
    "value" "text",
    "numeric_value" numeric(5,2),
    "notes" "text",
    "graded_at" "date" DEFAULT CURRENT_DATE,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."grades" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."homeschool_expenses" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "child_id" "uuid",
    "amount" numeric(10,2) NOT NULL,
    "expense_date" "date" NOT NULL,
    "tax_year" integer NOT NULL,
    "category" "text" NOT NULL,
    "description" "text" NOT NULL,
    "vendor" "text",
    "receipt_url" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "homeschool_expenses_amount_check" CHECK (("amount" >= (0)::numeric)),
    CONSTRAINT "homeschool_expenses_category_check" CHECK (("category" = ANY (ARRAY['curriculum'::"text", 'supplies'::"text", 'technology'::"text", 'coop_classes'::"text", 'field_trips'::"text", 'testing'::"text", 'subscriptions'::"text", 'other'::"text"])))
);


ALTER TABLE "public"."homeschool_expenses" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."homestead_connections" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "module" "text" NOT NULL,
    "project_title" "text" NOT NULL,
    "project_description" "text",
    "project_date" "date" DEFAULT CURRENT_DATE,
    "child_ids" "uuid"[],
    "subject_ids" "uuid"[],
    "credit_hours" numeric(4,2),
    "credit_notes" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "category" "text",
    "hours" numeric,
    CONSTRAINT "homestead_connections_category_check" CHECK (("category" = ANY (ARRAY['garden'::"text", 'livestock'::"text", 'food_preservation'::"text", 'construction'::"text", 'maintenance'::"text", 'other'::"text"]))),
    CONSTRAINT "homestead_connections_module_check" CHECK (("module" = ANY (ARRAY['homestead'::"text", 'home_diy'::"text"])))
);


ALTER TABLE "public"."homestead_connections" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."homestead_inputs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "section" "text" NOT NULL,
    "category" "text" NOT NULL,
    "input_date" "date" NOT NULL,
    "item" "text" NOT NULL,
    "quantity" numeric,
    "unit" "text",
    "cost" numeric DEFAULT 0 NOT NULL,
    "notes" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "homestead_inputs_section_check" CHECK (("section" = ANY (ARRAY['livestock'::"text", 'garden'::"text", 'preservation'::"text"])))
);


ALTER TABLE "public"."homestead_inputs" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."livestock_animals" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "animal_type" "text" NOT NULL,
    "name" "text" NOT NULL,
    "notes" "text",
    "is_active" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."livestock_animals" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."livestock_logs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "log_date" "date" DEFAULT CURRENT_DATE NOT NULL,
    "animal_type" "text" NOT NULL,
    "animal_name" "text",
    "quantity" numeric,
    "unit" "text",
    "notes" "text",
    "school_credit" boolean DEFAULT false NOT NULL,
    "child_ids" "uuid"[] DEFAULT '{}'::"uuid"[] NOT NULL,
    "subject_ids" "uuid"[] DEFAULT '{}'::"uuid"[] NOT NULL,
    "credit_hours" numeric,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "project_id" "uuid",
    "disposition" "text",
    "sale_amount" numeric(10,2),
    "sale_qty" numeric(10,2),
    "animal_id" "uuid",
    CONSTRAINT "livestock_logs_disposition_check" CHECK (("disposition" = ANY (ARRAY['personal'::"text", 'sold'::"text", 'mixed'::"text"])))
);


ALTER TABLE "public"."livestock_logs" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."planner_items" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "week_id" "uuid" NOT NULL,
    "track" "text" DEFAULT 'day'::"text" NOT NULL,
    "day_of_week" integer,
    "subject_id" "uuid",
    "course_unit_id" "uuid",
    "title" "text" NOT NULL,
    "status" "text" DEFAULT 'todo'::"text" NOT NULL,
    "daily_done" "jsonb",
    "sequence" integer DEFAULT 0 NOT NULL,
    "notes" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "daily_days" "jsonb",
    "daily_desc" "jsonb",
    CONSTRAINT "planner_items_status_check" CHECK (("status" = ANY (ARRAY['todo'::"text", 'done'::"text"]))),
    CONSTRAINT "planner_items_track_check" CHECK (("track" = ANY (ARRAY['daily'::"text", 'loop'::"text", 'day'::"text"])))
);


ALTER TABLE "public"."planner_items" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."planner_weeks" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "child_id" "uuid" NOT NULL,
    "school_year_id" "uuid",
    "week_start" "date",
    "is_template" boolean DEFAULT false NOT NULL,
    "template_name" "text",
    "loop_position" integer DEFAULT 0 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "logged_dates" "jsonb"
);


ALTER TABLE "public"."planner_weeks" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."platform_resources" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "title" "text" NOT NULL,
    "description" "text",
    "section" "text" NOT NULL,
    "tier" "text" DEFAULT 'free'::"text" NOT NULL,
    "file_url" "text",
    "file_type" "text" DEFAULT 'pdf'::"text" NOT NULL,
    "thumbnail_emoji" "text" DEFAULT '📄'::"text" NOT NULL,
    "is_active" boolean DEFAULT true NOT NULL,
    "sort_order" integer DEFAULT 0 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "platform_resources_file_type_check" CHECK (("file_type" = ANY (ARRAY['pdf'::"text", 'spreadsheet'::"text", 'doc'::"text", 'link'::"text", 'other'::"text"]))),
    CONSTRAINT "platform_resources_section_check" CHECK (("section" = ANY (ARRAY['homeschool'::"text", 'homestead'::"text", 'home_diy'::"text"]))),
    CONSTRAINT "platform_resources_tier_check" CHECK (("tier" = ANY (ARRAY['free'::"text", 'subscriber'::"text"])))
);


ALTER TABLE "public"."platform_resources" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."portfolio_items" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "child_id" "uuid" NOT NULL,
    "school_year_id" "uuid",
    "title" "text" NOT NULL,
    "description" "text",
    "subject_ids" "uuid"[] DEFAULT '{}'::"uuid"[] NOT NULL,
    "item_date" "date" NOT NULL,
    "file_url" "text",
    "file_type" "text",
    "is_featured" boolean DEFAULT false NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "portfolio_items_file_type_check" CHECK (("file_type" = ANY (ARRAY['image'::"text", 'document'::"text", 'link'::"text"])))
);


ALTER TABLE "public"."portfolio_items" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."preservation_logs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "log_date" "date" DEFAULT CURRENT_DATE NOT NULL,
    "item_name" "text" NOT NULL,
    "method" "text" NOT NULL,
    "quantity" numeric,
    "unit" "text",
    "notes" "text",
    "school_credit" boolean DEFAULT false NOT NULL,
    "child_ids" "uuid"[] DEFAULT '{}'::"uuid"[] NOT NULL,
    "subject_ids" "uuid"[] DEFAULT '{}'::"uuid"[] NOT NULL,
    "credit_hours" numeric,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."preservation_logs" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."project_expenses" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "project_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "amount" numeric(10,2) NOT NULL,
    "description" "text" NOT NULL,
    "expense_date" "date" DEFAULT CURRENT_DATE NOT NULL,
    "store" "text",
    "notes" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "project_expenses_amount_check" CHECK (("amount" >= (0)::numeric))
);


ALTER TABLE "public"."project_expenses" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."project_tasks" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "project_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "title" "text" NOT NULL,
    "is_complete" boolean DEFAULT false NOT NULL,
    "sort_order" integer DEFAULT 0,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."project_tasks" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."projects" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "title" "text" NOT NULL,
    "description" "text",
    "category" "text" NOT NULL,
    "status" "text" DEFAULT 'up_next'::"text" NOT NULL,
    "target" "text",
    "notes" "text",
    "sort_order" integer DEFAULT 0,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "budget" numeric(10,2),
    CONSTRAINT "projects_category_check" CHECK (("category" = ANY (ARRAY['homestead'::"text", 'home_diy'::"text"]))),
    CONSTRAINT "projects_status_check" CHECK (("status" = ANY (ARRAY['active'::"text", 'up_next'::"text", 'high_priority'::"text", 'medium_priority'::"text", 'low_priority'::"text", 'done'::"text"])))
);


ALTER TABLE "public"."projects" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."resources" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "child_id" "uuid" NOT NULL,
    "school_year_id" "uuid",
    "title" "text" NOT NULL,
    "type" "text",
    "subject_id" "uuid",
    "notes" "text",
    "acquired_at" "date",
    "created_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "resources_type_check" CHECK (("type" = ANY (ARRAY['book'::"text", 'curriculum'::"text", 'website'::"text", 'video'::"text", 'material'::"text", 'other'::"text"])))
);


ALTER TABLE "public"."resources" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."school_years" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "child_id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "start_date" "date" NOT NULL,
    "end_date" "date" NOT NULL,
    "days_per_week" integer DEFAULT 5,
    "state" "text" DEFAULT 'MO'::"text",
    "is_active" boolean DEFAULT true,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."school_years" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."state_requirements" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "state" "text" NOT NULL,
    "tracking_mode" "text" DEFAULT 'hours'::"text" NOT NULL,
    "annual_total_hours" integer,
    "annual_total_days" integer,
    "core_hours_required" integer,
    "subjects" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "notes" "text",
    "source_url" "text",
    "last_verified" "date",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "requirement_type" "text",
    "annual_hours" integer,
    "hours_elementary" integer,
    "hours_secondary" integer,
    "secondary_starts_grade" integer,
    "annual_days" integer,
    "hours_per_day" numeric,
    "core_hours" integer,
    "core_hours_at_home" integer,
    "is_advisory" boolean DEFAULT false NOT NULL,
    "is_enforced" boolean DEFAULT true NOT NULL,
    "needs_signoff" boolean DEFAULT false NOT NULL,
    "testing_required" boolean DEFAULT false NOT NULL,
    "testing_grades" integer[],
    "testing_note" "text",
    "requirement_summary" "text",
    "citation" "text"
);


ALTER TABLE "public"."state_requirements" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."subjects" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "child_id" "uuid" NOT NULL,
    "school_year_id" "uuid",
    "name" "text" NOT NULL,
    "type" "text",
    "description" "text",
    "color" "text",
    "is_active" boolean DEFAULT true,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."subjects" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."subscriptions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "stripe_customer_id" "text",
    "stripe_subscription_id" "text",
    "status" "text" DEFAULT 'trialing'::"text" NOT NULL,
    "trial_end" timestamp with time zone,
    "current_period_end" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "tier" "text" DEFAULT 'individual'::"text" NOT NULL,
    "stripe_price_id" "text",
    CONSTRAINT "subscriptions_tier_chk" CHECK (("tier" = ANY (ARRAY['individual'::"text", 'family'::"text"])))
);


ALTER TABLE "public"."subscriptions" OWNER TO "postgres";


ALTER TABLE ONLY "public"."activities"
    ADD CONSTRAINT "activities_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."assessment_logs"
    ADD CONSTRAINT "assessment_logs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."attendance"
    ADD CONSTRAINT "attendance_child_id_attendance_date_key" UNIQUE ("child_id", "attendance_date");



ALTER TABLE ONLY "public"."attendance"
    ADD CONSTRAINT "attendance_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."beta_users"
    ADD CONSTRAINT "beta_users_email_key" UNIQUE ("email");



ALTER TABLE ONLY "public"."beta_users"
    ADD CONSTRAINT "beta_users_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."beta_users"
    ADD CONSTRAINT "beta_users_user_id_key" UNIQUE ("user_id");



ALTER TABLE ONLY "public"."children"
    ADD CONSTRAINT "children_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."curriculum_plans"
    ADD CONSTRAINT "curriculum_plans_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."curriculum_plans"
    ADD CONSTRAINT "curriculum_plans_subject_id_key" UNIQUE ("subject_id");



ALTER TABLE ONLY "public"."curriculum_units"
    ADD CONSTRAINT "curriculum_units_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."daily_log"
    ADD CONSTRAINT "daily_log_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."equipment_maintenance"
    ADD CONSTRAINT "equipment_maintenance_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."family_members"
    ADD CONSTRAINT "family_members_invite_token_key" UNIQUE ("invite_token");



ALTER TABLE ONLY "public"."family_members"
    ADD CONSTRAINT "family_members_owner_id_member_email_key" UNIQUE ("owner_id", "member_email");



ALTER TABLE ONLY "public"."family_members"
    ADD CONSTRAINT "family_members_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."garden_beds"
    ADD CONSTRAINT "garden_beds_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."garden_beds"
    ADD CONSTRAINT "garden_beds_user_id_name_key" UNIQUE ("user_id", "name");



ALTER TABLE ONLY "public"."garden_entries"
    ADD CONSTRAINT "garden_entries_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."grades"
    ADD CONSTRAINT "grades_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."homeschool_expenses"
    ADD CONSTRAINT "homeschool_expenses_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."homestead_connections"
    ADD CONSTRAINT "homestead_connections_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."homestead_inputs"
    ADD CONSTRAINT "homestead_inputs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."livestock_animals"
    ADD CONSTRAINT "livestock_animals_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."livestock_animals"
    ADD CONSTRAINT "livestock_animals_user_id_name_key" UNIQUE ("user_id", "name");



ALTER TABLE ONLY "public"."livestock_logs"
    ADD CONSTRAINT "livestock_logs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."planner_items"
    ADD CONSTRAINT "planner_items_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."planner_weeks"
    ADD CONSTRAINT "planner_weeks_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."platform_resources"
    ADD CONSTRAINT "platform_resources_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."portfolio_items"
    ADD CONSTRAINT "portfolio_items_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."preservation_logs"
    ADD CONSTRAINT "preservation_logs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."project_expenses"
    ADD CONSTRAINT "project_expenses_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."project_tasks"
    ADD CONSTRAINT "project_tasks_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."projects"
    ADD CONSTRAINT "projects_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."resources"
    ADD CONSTRAINT "resources_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."school_years"
    ADD CONSTRAINT "school_years_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."state_requirements"
    ADD CONSTRAINT "state_requirements_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."state_requirements"
    ADD CONSTRAINT "state_requirements_state_key" UNIQUE ("state");



ALTER TABLE ONLY "public"."subjects"
    ADD CONSTRAINT "subjects_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."subscriptions"
    ADD CONSTRAINT "subscriptions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."subscriptions"
    ADD CONSTRAINT "subscriptions_stripe_customer_id_key" UNIQUE ("stripe_customer_id");



ALTER TABLE ONLY "public"."subscriptions"
    ADD CONSTRAINT "subscriptions_stripe_subscription_id_key" UNIQUE ("stripe_subscription_id");



ALTER TABLE ONLY "public"."subscriptions"
    ADD CONSTRAINT "subscriptions_user_id_key" UNIQUE ("user_id");



CREATE INDEX "beta_users_email_idx" ON "public"."beta_users" USING "btree" ("email");



CREATE INDEX "equipment_maintenance_user" ON "public"."equipment_maintenance" USING "btree" ("user_id", "is_active");



CREATE INDEX "garden_entries_project_id_idx" ON "public"."garden_entries" USING "btree" ("project_id");



CREATE INDEX "garden_entries_user_status" ON "public"."garden_entries" USING "btree" ("user_id", "status");



CREATE INDEX "homeschool_expenses_child_id_idx" ON "public"."homeschool_expenses" USING "btree" ("child_id");



CREATE INDEX "homeschool_expenses_tax_year_idx" ON "public"."homeschool_expenses" USING "btree" ("user_id", "tax_year");



CREATE INDEX "homeschool_expenses_user_id_idx" ON "public"."homeschool_expenses" USING "btree" ("user_id");



CREATE INDEX "homestead_inputs_category_idx" ON "public"."homestead_inputs" USING "btree" ("user_id", "section", "category");



CREATE INDEX "homestead_inputs_user_section_idx" ON "public"."homestead_inputs" USING "btree" ("user_id", "section");



CREATE INDEX "idx_activities_child" ON "public"."activities" USING "btree" ("child_id");



CREATE INDEX "idx_activities_school_year_id" ON "public"."activities" USING "btree" ("school_year_id");



CREATE INDEX "idx_activities_user_id" ON "public"."activities" USING "btree" ("user_id");



CREATE INDEX "idx_assessment_logs_user_id" ON "public"."assessment_logs" USING "btree" ("user_id");



CREATE INDEX "idx_attendance_child_date" ON "public"."attendance" USING "btree" ("child_id", "attendance_date" DESC);



CREATE INDEX "idx_attendance_school_year_id" ON "public"."attendance" USING "btree" ("school_year_id");



CREATE INDEX "idx_attendance_user_id" ON "public"."attendance" USING "btree" ("user_id");



CREATE INDEX "idx_children_user" ON "public"."children" USING "btree" ("user_id");



CREATE INDEX "idx_curriculum_plans_child" ON "public"."curriculum_plans" USING "btree" ("child_id");



CREATE INDEX "idx_curriculum_plans_subject" ON "public"."curriculum_plans" USING "btree" ("subject_id");



CREATE INDEX "idx_curriculum_plans_user_id" ON "public"."curriculum_plans" USING "btree" ("user_id");



CREATE INDEX "idx_curriculum_units_plan" ON "public"."curriculum_units" USING "btree" ("plan_id");



CREATE INDEX "idx_curriculum_units_user_id" ON "public"."curriculum_units" USING "btree" ("user_id");



CREATE INDEX "idx_daily_log_child_date" ON "public"."daily_log" USING "btree" ("child_id", "log_date" DESC);



CREATE INDEX "idx_daily_log_school_year_id" ON "public"."daily_log" USING "btree" ("school_year_id");



CREATE INDEX "idx_daily_log_user_date" ON "public"."daily_log" USING "btree" ("user_id", "log_date" DESC);



CREATE INDEX "idx_family_members_member_id" ON "public"."family_members" USING "btree" ("member_id");



CREATE INDEX "idx_garden_entries_bed_id" ON "public"."garden_entries" USING "btree" ("bed_id");



CREATE INDEX "idx_grades_child_id" ON "public"."grades" USING "btree" ("child_id");



CREATE INDEX "idx_grades_subject" ON "public"."grades" USING "btree" ("subject_id");



CREATE INDEX "idx_grades_user_id" ON "public"."grades" USING "btree" ("user_id");



CREATE INDEX "idx_homestead_connections_user" ON "public"."homestead_connections" USING "btree" ("user_id");



CREATE INDEX "idx_livestock_logs_animal_id" ON "public"."livestock_logs" USING "btree" ("animal_id");



CREATE INDEX "idx_planner_items_user_id" ON "public"."planner_items" USING "btree" ("user_id");



CREATE INDEX "idx_planner_items_week" ON "public"."planner_items" USING "btree" ("week_id");



CREATE INDEX "idx_planner_weeks_child" ON "public"."planner_weeks" USING "btree" ("child_id", "school_year_id");



CREATE INDEX "idx_planner_weeks_template" ON "public"."planner_weeks" USING "btree" ("child_id") WHERE ("is_template" = true);



CREATE INDEX "idx_planner_weeks_user_id" ON "public"."planner_weeks" USING "btree" ("user_id");



CREATE INDEX "idx_portfolio_items_school_year_id" ON "public"."portfolio_items" USING "btree" ("school_year_id");



CREATE INDEX "idx_project_expenses_user_id" ON "public"."project_expenses" USING "btree" ("user_id");



CREATE INDEX "idx_project_tasks_project_id" ON "public"."project_tasks" USING "btree" ("project_id");



CREATE INDEX "idx_project_tasks_user_id" ON "public"."project_tasks" USING "btree" ("user_id");



CREATE INDEX "idx_projects_user_id" ON "public"."projects" USING "btree" ("user_id");



CREATE INDEX "idx_resources_child_id" ON "public"."resources" USING "btree" ("child_id");



CREATE INDEX "idx_resources_school_year_id" ON "public"."resources" USING "btree" ("school_year_id");



CREATE INDEX "idx_resources_subject_id" ON "public"."resources" USING "btree" ("subject_id");



CREATE INDEX "idx_resources_user_id" ON "public"."resources" USING "btree" ("user_id");



CREATE INDEX "idx_school_years_child" ON "public"."school_years" USING "btree" ("child_id");



CREATE INDEX "idx_school_years_user_id" ON "public"."school_years" USING "btree" ("user_id");



CREATE INDEX "idx_subjects_child" ON "public"."subjects" USING "btree" ("child_id");



CREATE INDEX "idx_subjects_user_id" ON "public"."subjects" USING "btree" ("user_id");



CREATE INDEX "idx_subjects_year" ON "public"."subjects" USING "btree" ("school_year_id");



CREATE INDEX "livestock_logs_project_id_idx" ON "public"."livestock_logs" USING "btree" ("project_id");



CREATE INDEX "livestock_logs_user_date" ON "public"."livestock_logs" USING "btree" ("user_id", "log_date" DESC);



CREATE INDEX "portfolio_items_child_id_idx" ON "public"."portfolio_items" USING "btree" ("child_id");



CREATE INDEX "portfolio_items_is_featured_idx" ON "public"."portfolio_items" USING "btree" ("is_featured") WHERE ("is_featured" = true);



CREATE INDEX "portfolio_items_item_date_idx" ON "public"."portfolio_items" USING "btree" ("item_date" DESC);



CREATE INDEX "portfolio_items_user_id_idx" ON "public"."portfolio_items" USING "btree" ("user_id");



CREATE INDEX "preservation_logs_user_date" ON "public"."preservation_logs" USING "btree" ("user_id", "log_date" DESC);



CREATE INDEX "project_expenses_project_id_idx" ON "public"."project_expenses" USING "btree" ("project_id");



CREATE INDEX "subscriptions_stripe_customer_id_idx" ON "public"."subscriptions" USING "btree" ("stripe_customer_id");



CREATE INDEX "subscriptions_stripe_subscription_id_idx" ON "public"."subscriptions" USING "btree" ("stripe_subscription_id");



CREATE INDEX "subscriptions_user_id_idx" ON "public"."subscriptions" USING "btree" ("user_id");



CREATE UNIQUE INDEX "uniq_planner_week_real" ON "public"."planner_weeks" USING "btree" ("child_id", "school_year_id", "week_start") WHERE ("is_template" = false);



CREATE OR REPLACE TRIGGER "update_homeschool_expenses_updated_at" BEFORE UPDATE ON "public"."homeschool_expenses" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "update_portfolio_items_updated_at" BEFORE UPDATE ON "public"."portfolio_items" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



ALTER TABLE ONLY "public"."activities"
    ADD CONSTRAINT "activities_child_id_fkey" FOREIGN KEY ("child_id") REFERENCES "public"."children"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."activities"
    ADD CONSTRAINT "activities_school_year_id_fkey" FOREIGN KEY ("school_year_id") REFERENCES "public"."school_years"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."activities"
    ADD CONSTRAINT "activities_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."assessment_logs"
    ADD CONSTRAINT "assessment_logs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."attendance"
    ADD CONSTRAINT "attendance_child_id_fkey" FOREIGN KEY ("child_id") REFERENCES "public"."children"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."attendance"
    ADD CONSTRAINT "attendance_school_year_id_fkey" FOREIGN KEY ("school_year_id") REFERENCES "public"."school_years"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."attendance"
    ADD CONSTRAINT "attendance_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."beta_users"
    ADD CONSTRAINT "beta_users_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."children"
    ADD CONSTRAINT "children_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."curriculum_plans"
    ADD CONSTRAINT "curriculum_plans_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."curriculum_units"
    ADD CONSTRAINT "curriculum_units_plan_id_fkey" FOREIGN KEY ("plan_id") REFERENCES "public"."curriculum_plans"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."curriculum_units"
    ADD CONSTRAINT "curriculum_units_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."daily_log"
    ADD CONSTRAINT "daily_log_child_id_fkey" FOREIGN KEY ("child_id") REFERENCES "public"."children"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."daily_log"
    ADD CONSTRAINT "daily_log_school_year_id_fkey" FOREIGN KEY ("school_year_id") REFERENCES "public"."school_years"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."daily_log"
    ADD CONSTRAINT "daily_log_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."equipment_maintenance"
    ADD CONSTRAINT "equipment_maintenance_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."family_members"
    ADD CONSTRAINT "family_members_member_id_fkey" FOREIGN KEY ("member_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."family_members"
    ADD CONSTRAINT "family_members_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."garden_beds"
    ADD CONSTRAINT "garden_beds_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."garden_entries"
    ADD CONSTRAINT "garden_entries_bed_id_fkey" FOREIGN KEY ("bed_id") REFERENCES "public"."garden_beds"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."garden_entries"
    ADD CONSTRAINT "garden_entries_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."garden_entries"
    ADD CONSTRAINT "garden_entries_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."grades"
    ADD CONSTRAINT "grades_child_id_fkey" FOREIGN KEY ("child_id") REFERENCES "public"."children"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."grades"
    ADD CONSTRAINT "grades_subject_id_fkey" FOREIGN KEY ("subject_id") REFERENCES "public"."subjects"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."grades"
    ADD CONSTRAINT "grades_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."homeschool_expenses"
    ADD CONSTRAINT "homeschool_expenses_child_id_fkey" FOREIGN KEY ("child_id") REFERENCES "public"."children"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."homeschool_expenses"
    ADD CONSTRAINT "homeschool_expenses_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."homestead_connections"
    ADD CONSTRAINT "homestead_connections_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."homestead_inputs"
    ADD CONSTRAINT "homestead_inputs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."livestock_animals"
    ADD CONSTRAINT "livestock_animals_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."livestock_logs"
    ADD CONSTRAINT "livestock_logs_animal_id_fkey" FOREIGN KEY ("animal_id") REFERENCES "public"."livestock_animals"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."livestock_logs"
    ADD CONSTRAINT "livestock_logs_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."livestock_logs"
    ADD CONSTRAINT "livestock_logs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."planner_items"
    ADD CONSTRAINT "planner_items_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."planner_items"
    ADD CONSTRAINT "planner_items_week_id_fkey" FOREIGN KEY ("week_id") REFERENCES "public"."planner_weeks"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."planner_weeks"
    ADD CONSTRAINT "planner_weeks_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."portfolio_items"
    ADD CONSTRAINT "portfolio_items_child_id_fkey" FOREIGN KEY ("child_id") REFERENCES "public"."children"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."portfolio_items"
    ADD CONSTRAINT "portfolio_items_school_year_id_fkey" FOREIGN KEY ("school_year_id") REFERENCES "public"."school_years"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."portfolio_items"
    ADD CONSTRAINT "portfolio_items_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."preservation_logs"
    ADD CONSTRAINT "preservation_logs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."project_expenses"
    ADD CONSTRAINT "project_expenses_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."project_expenses"
    ADD CONSTRAINT "project_expenses_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."project_tasks"
    ADD CONSTRAINT "project_tasks_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."project_tasks"
    ADD CONSTRAINT "project_tasks_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."projects"
    ADD CONSTRAINT "projects_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."resources"
    ADD CONSTRAINT "resources_child_id_fkey" FOREIGN KEY ("child_id") REFERENCES "public"."children"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."resources"
    ADD CONSTRAINT "resources_school_year_id_fkey" FOREIGN KEY ("school_year_id") REFERENCES "public"."school_years"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."resources"
    ADD CONSTRAINT "resources_subject_id_fkey" FOREIGN KEY ("subject_id") REFERENCES "public"."subjects"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."resources"
    ADD CONSTRAINT "resources_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."school_years"
    ADD CONSTRAINT "school_years_child_id_fkey" FOREIGN KEY ("child_id") REFERENCES "public"."children"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."school_years"
    ADD CONSTRAINT "school_years_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."subjects"
    ADD CONSTRAINT "subjects_child_id_fkey" FOREIGN KEY ("child_id") REFERENCES "public"."children"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."subjects"
    ADD CONSTRAINT "subjects_school_year_id_fkey" FOREIGN KEY ("school_year_id") REFERENCES "public"."school_years"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."subjects"
    ADD CONSTRAINT "subjects_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."subscriptions"
    ADD CONSTRAINT "subscriptions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id");



CREATE POLICY "Family access activities" ON "public"."activities" TO "authenticated" USING ("public"."is_family_authorized"("user_id"));



CREATE POLICY "Family access assessment_logs" ON "public"."assessment_logs" TO "authenticated" USING ("public"."is_family_authorized"("user_id"));



CREATE POLICY "Family access attendance" ON "public"."attendance" TO "authenticated" USING ("public"."is_family_authorized"("user_id"));



CREATE POLICY "Family access children" ON "public"."children" TO "authenticated" USING ("public"."is_family_authorized"("user_id"));



CREATE POLICY "Family access curriculum_plans" ON "public"."curriculum_plans" TO "authenticated" USING ("public"."is_family_authorized"("user_id"));



CREATE POLICY "Family access curriculum_units" ON "public"."curriculum_units" TO "authenticated" USING ("public"."is_family_authorized"("user_id"));



CREATE POLICY "Family access daily_log" ON "public"."daily_log" TO "authenticated" USING ("public"."is_family_authorized"("user_id"));



CREATE POLICY "Family access equipment_maintenance" ON "public"."equipment_maintenance" TO "authenticated" USING ("public"."is_family_authorized"("user_id"));



CREATE POLICY "Family access garden_beds" ON "public"."garden_beds" TO "authenticated" USING ("public"."is_family_authorized"("user_id"));



CREATE POLICY "Family access garden_entries" ON "public"."garden_entries" TO "authenticated" USING ("public"."is_family_authorized"("user_id"));



CREATE POLICY "Family access grades" ON "public"."grades" TO "authenticated" USING ("public"."is_family_authorized"("user_id"));



CREATE POLICY "Family access homeschool_expenses" ON "public"."homeschool_expenses" TO "authenticated" USING ("public"."is_family_authorized"("user_id"));



CREATE POLICY "Family access homestead_inputs" ON "public"."homestead_inputs" TO "authenticated" USING ("public"."is_family_authorized"("user_id"));



CREATE POLICY "Family access livestock_animals" ON "public"."livestock_animals" TO "authenticated" USING ("public"."is_family_authorized"("user_id"));



CREATE POLICY "Family access livestock_logs" ON "public"."livestock_logs" TO "authenticated" USING ("public"."is_family_authorized"("user_id"));



CREATE POLICY "Family access planner_items" ON "public"."planner_items" TO "authenticated" USING ("public"."is_family_authorized"("user_id"));



CREATE POLICY "Family access planner_weeks" ON "public"."planner_weeks" TO "authenticated" USING ("public"."is_family_authorized"("user_id"));



CREATE POLICY "Family access portfolio_items" ON "public"."portfolio_items" TO "authenticated" USING ("public"."is_family_authorized"("user_id"));



CREATE POLICY "Family access preservation_logs" ON "public"."preservation_logs" TO "authenticated" USING ("public"."is_family_authorized"("user_id"));



CREATE POLICY "Family access project_expenses" ON "public"."project_expenses" TO "authenticated" USING ("public"."is_family_authorized"("user_id"));



CREATE POLICY "Family access project_tasks" ON "public"."project_tasks" TO "authenticated" USING ("public"."is_family_authorized"("user_id"));



CREATE POLICY "Family access projects" ON "public"."projects" TO "authenticated" USING ("public"."is_family_authorized"("user_id"));



CREATE POLICY "Family access resources" ON "public"."resources" TO "authenticated" USING ("public"."is_family_authorized"("user_id"));



CREATE POLICY "Family access school_years" ON "public"."school_years" TO "authenticated" USING ("public"."is_family_authorized"("user_id"));



CREATE POLICY "Family access subjects" ON "public"."subjects" TO "authenticated" USING ("public"."is_family_authorized"("user_id"));



CREATE POLICY "Member can accept own invite" ON "public"."family_members" FOR UPDATE TO "authenticated" USING ((( SELECT "auth"."uid"() AS "uid") = "member_id")) WITH CHECK ((( SELECT "auth"."uid"() AS "uid") = "member_id"));



CREATE POLICY "Member can view own invite" ON "public"."family_members" FOR SELECT TO "authenticated" USING ((( SELECT "auth"."uid"() AS "uid") = "member_id"));



CREATE POLICY "Owner manages family members" ON "public"."family_members" TO "authenticated" USING ((( SELECT "auth"."uid"() AS "uid") = "owner_id"));



CREATE POLICY "State requirements are readable by all authenticated users" ON "public"."state_requirements" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "Users can delete own homestead_connections" ON "public"."homestead_connections" FOR DELETE TO "authenticated" USING ((( SELECT "auth"."uid"() AS "uid") = "user_id"));



CREATE POLICY "Users can insert own homestead_connections" ON "public"."homestead_connections" FOR INSERT TO "authenticated" WITH CHECK ((( SELECT "auth"."uid"() AS "uid") = "user_id"));



CREATE POLICY "Users can read own subscription" ON "public"."subscriptions" FOR SELECT TO "authenticated" USING ((( SELECT "auth"."uid"() AS "uid") = "user_id"));



CREATE POLICY "Users can read their own beta status" ON "public"."beta_users" FOR SELECT TO "authenticated" USING (((( SELECT "auth"."uid"() AS "uid") = "user_id") OR (( SELECT "auth"."email"() AS "email") = "email")));



CREATE POLICY "Users can update own homestead_connections" ON "public"."homestead_connections" FOR UPDATE TO "authenticated" USING ((( SELECT "auth"."uid"() AS "uid") = "user_id"));



CREATE POLICY "Users can view own homestead_connections" ON "public"."homestead_connections" FOR SELECT TO "authenticated" USING ((( SELECT "auth"."uid"() AS "uid") = "user_id"));



ALTER TABLE "public"."activities" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."assessment_logs" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."attendance" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "authenticated users can read active resources" ON "public"."platform_resources" FOR SELECT TO "authenticated" USING (("is_active" = true));



ALTER TABLE "public"."beta_users" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."children" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."curriculum_plans" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."curriculum_units" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."daily_log" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."equipment_maintenance" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."family_members" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."garden_beds" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."garden_entries" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."grades" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."homeschool_expenses" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."homestead_connections" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."homestead_inputs" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."livestock_animals" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."livestock_logs" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."planner_items" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."planner_weeks" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."platform_resources" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."portfolio_items" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."preservation_logs" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."project_expenses" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."project_tasks" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."projects" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."resources" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."school_years" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."state_requirements" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."subjects" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."subscriptions" ENABLE ROW LEVEL SECURITY;


GRANT USAGE ON SCHEMA "public" TO "postgres";
GRANT USAGE ON SCHEMA "public" TO "anon";
GRANT USAGE ON SCHEMA "public" TO "authenticated";
GRANT USAGE ON SCHEMA "public" TO "service_role";



REVOKE ALL ON FUNCTION "public"."is_family_authorized"("owner_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."is_family_authorized"("owner_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_family_authorized"("owner_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."save_log_entry"("p_log_date" "date", "p_photo_urls" "text"[], "p_events" "jsonb") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."save_log_entry"("p_log_date" "date", "p_photo_urls" "text"[], "p_events" "jsonb") TO "authenticated";
GRANT ALL ON FUNCTION "public"."save_log_entry"("p_log_date" "date", "p_photo_urls" "text"[], "p_events" "jsonb") TO "service_role";



GRANT ALL ON FUNCTION "public"."update_updated_at_column"() TO "anon";
GRANT ALL ON FUNCTION "public"."update_updated_at_column"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_updated_at_column"() TO "service_role";



GRANT ALL ON TABLE "public"."activities" TO "anon";
GRANT ALL ON TABLE "public"."activities" TO "authenticated";
GRANT ALL ON TABLE "public"."activities" TO "service_role";



GRANT ALL ON TABLE "public"."assessment_logs" TO "anon";
GRANT ALL ON TABLE "public"."assessment_logs" TO "authenticated";
GRANT ALL ON TABLE "public"."assessment_logs" TO "service_role";



GRANT ALL ON TABLE "public"."attendance" TO "anon";
GRANT ALL ON TABLE "public"."attendance" TO "authenticated";
GRANT ALL ON TABLE "public"."attendance" TO "service_role";



GRANT ALL ON TABLE "public"."beta_users" TO "anon";
GRANT ALL ON TABLE "public"."beta_users" TO "authenticated";
GRANT ALL ON TABLE "public"."beta_users" TO "service_role";



GRANT ALL ON TABLE "public"."children" TO "anon";
GRANT ALL ON TABLE "public"."children" TO "authenticated";
GRANT ALL ON TABLE "public"."children" TO "service_role";



GRANT ALL ON TABLE "public"."curriculum_plans" TO "anon";
GRANT ALL ON TABLE "public"."curriculum_plans" TO "authenticated";
GRANT ALL ON TABLE "public"."curriculum_plans" TO "service_role";



GRANT ALL ON TABLE "public"."curriculum_units" TO "anon";
GRANT ALL ON TABLE "public"."curriculum_units" TO "authenticated";
GRANT ALL ON TABLE "public"."curriculum_units" TO "service_role";



GRANT ALL ON TABLE "public"."daily_log" TO "anon";
GRANT ALL ON TABLE "public"."daily_log" TO "authenticated";
GRANT ALL ON TABLE "public"."daily_log" TO "service_role";



GRANT ALL ON TABLE "public"."equipment_maintenance" TO "anon";
GRANT ALL ON TABLE "public"."equipment_maintenance" TO "authenticated";
GRANT ALL ON TABLE "public"."equipment_maintenance" TO "service_role";



GRANT ALL ON TABLE "public"."family_members" TO "anon";
GRANT ALL ON TABLE "public"."family_members" TO "authenticated";
GRANT ALL ON TABLE "public"."family_members" TO "service_role";



GRANT ALL ON TABLE "public"."garden_beds" TO "anon";
GRANT ALL ON TABLE "public"."garden_beds" TO "authenticated";
GRANT ALL ON TABLE "public"."garden_beds" TO "service_role";



GRANT ALL ON TABLE "public"."garden_entries" TO "anon";
GRANT ALL ON TABLE "public"."garden_entries" TO "authenticated";
GRANT ALL ON TABLE "public"."garden_entries" TO "service_role";



GRANT ALL ON TABLE "public"."grades" TO "anon";
GRANT ALL ON TABLE "public"."grades" TO "authenticated";
GRANT ALL ON TABLE "public"."grades" TO "service_role";



GRANT ALL ON TABLE "public"."homeschool_expenses" TO "anon";
GRANT ALL ON TABLE "public"."homeschool_expenses" TO "authenticated";
GRANT ALL ON TABLE "public"."homeschool_expenses" TO "service_role";



GRANT ALL ON TABLE "public"."homestead_connections" TO "anon";
GRANT ALL ON TABLE "public"."homestead_connections" TO "authenticated";
GRANT ALL ON TABLE "public"."homestead_connections" TO "service_role";



GRANT ALL ON TABLE "public"."homestead_inputs" TO "anon";
GRANT ALL ON TABLE "public"."homestead_inputs" TO "authenticated";
GRANT ALL ON TABLE "public"."homestead_inputs" TO "service_role";



GRANT ALL ON TABLE "public"."livestock_animals" TO "anon";
GRANT ALL ON TABLE "public"."livestock_animals" TO "authenticated";
GRANT ALL ON TABLE "public"."livestock_animals" TO "service_role";



GRANT ALL ON TABLE "public"."livestock_logs" TO "anon";
GRANT ALL ON TABLE "public"."livestock_logs" TO "authenticated";
GRANT ALL ON TABLE "public"."livestock_logs" TO "service_role";



GRANT ALL ON TABLE "public"."planner_items" TO "anon";
GRANT ALL ON TABLE "public"."planner_items" TO "authenticated";
GRANT ALL ON TABLE "public"."planner_items" TO "service_role";



GRANT ALL ON TABLE "public"."planner_weeks" TO "anon";
GRANT ALL ON TABLE "public"."planner_weeks" TO "authenticated";
GRANT ALL ON TABLE "public"."planner_weeks" TO "service_role";



GRANT ALL ON TABLE "public"."platform_resources" TO "anon";
GRANT ALL ON TABLE "public"."platform_resources" TO "authenticated";
GRANT ALL ON TABLE "public"."platform_resources" TO "service_role";



GRANT ALL ON TABLE "public"."portfolio_items" TO "anon";
GRANT ALL ON TABLE "public"."portfolio_items" TO "authenticated";
GRANT ALL ON TABLE "public"."portfolio_items" TO "service_role";



GRANT ALL ON TABLE "public"."preservation_logs" TO "anon";
GRANT ALL ON TABLE "public"."preservation_logs" TO "authenticated";
GRANT ALL ON TABLE "public"."preservation_logs" TO "service_role";



GRANT ALL ON TABLE "public"."project_expenses" TO "anon";
GRANT ALL ON TABLE "public"."project_expenses" TO "authenticated";
GRANT ALL ON TABLE "public"."project_expenses" TO "service_role";



GRANT ALL ON TABLE "public"."project_tasks" TO "anon";
GRANT ALL ON TABLE "public"."project_tasks" TO "authenticated";
GRANT ALL ON TABLE "public"."project_tasks" TO "service_role";



GRANT ALL ON TABLE "public"."projects" TO "anon";
GRANT ALL ON TABLE "public"."projects" TO "authenticated";
GRANT ALL ON TABLE "public"."projects" TO "service_role";



GRANT ALL ON TABLE "public"."resources" TO "anon";
GRANT ALL ON TABLE "public"."resources" TO "authenticated";
GRANT ALL ON TABLE "public"."resources" TO "service_role";



GRANT ALL ON TABLE "public"."school_years" TO "anon";
GRANT ALL ON TABLE "public"."school_years" TO "authenticated";
GRANT ALL ON TABLE "public"."school_years" TO "service_role";



GRANT ALL ON TABLE "public"."state_requirements" TO "anon";
GRANT ALL ON TABLE "public"."state_requirements" TO "authenticated";
GRANT ALL ON TABLE "public"."state_requirements" TO "service_role";



GRANT ALL ON TABLE "public"."subjects" TO "anon";
GRANT ALL ON TABLE "public"."subjects" TO "authenticated";
GRANT ALL ON TABLE "public"."subjects" TO "service_role";



GRANT ALL ON TABLE "public"."subscriptions" TO "anon";
GRANT ALL ON TABLE "public"."subscriptions" TO "authenticated";
GRANT ALL ON TABLE "public"."subscriptions" TO "service_role";



ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "service_role";







