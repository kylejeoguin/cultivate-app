-- Recurring homestead chores + completions (backlog P3-7).
--
-- The recurring operational backbone of a homestead: "move the chicken tractor every 3 days",
-- "clean the coop weekly", "weed the raised beds every Friday". Distinct from Projects (one-off)
-- and from the log (a record of what happened) — this is a schedule of what's DUE. Mirrors the
-- equipment_maintenance reminder shape (last/next date + interval), and a completion can count as
-- homeschool credit for the child who did it.

CREATE TABLE IF NOT EXISTS public.homestead_chores (
  id                uuid DEFAULT gen_random_uuid() NOT NULL,
  user_id           uuid NOT NULL,
  name              text NOT NULL,
  cadence_type      text NOT NULL DEFAULT 'interval',
  interval_days     integer,   -- cadence_type='interval': recurs every N days
  weekday           integer,   -- cadence_type='weekly': 0=Sun .. 6=Sat
  estimated_minutes integer,   -- Kyle's "time to complete"; pre-fills credit hours on completion
  assigned_child_id uuid,      -- optional: who usually does it (pre-fills the credit picker)
  last_completed_date date,
  next_due_date     date NOT NULL,
  is_active         boolean NOT NULL DEFAULT true,
  created_at        timestamptz DEFAULT now() NOT NULL,
  updated_at        timestamptz DEFAULT now() NOT NULL,
  CONSTRAINT homestead_chores_pkey PRIMARY KEY (id),
  CONSTRAINT homestead_chores_user_id_fkey FOREIGN KEY (user_id)
    REFERENCES auth.users(id) ON DELETE CASCADE,
  CONSTRAINT homestead_chores_assigned_child_fkey FOREIGN KEY (assigned_child_id)
    REFERENCES public.children(id) ON DELETE SET NULL,
  CONSTRAINT homestead_chores_cadence_type_check CHECK (cadence_type IN ('interval','weekly')),
  CONSTRAINT homestead_chores_cadence_valid CHECK (
    (cadence_type = 'interval' AND interval_days IS NOT NULL AND interval_days > 0) OR
    (cadence_type = 'weekly'   AND weekday IS NOT NULL AND weekday BETWEEN 0 AND 6)
  ),
  CONSTRAINT homestead_chores_est_minutes_nonneg CHECK (estimated_minutes IS NULL OR estimated_minutes >= 0)
);

ALTER TABLE public.homestead_chores OWNER TO postgres;
ALTER TABLE public.homestead_chores ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Family access homestead_chores" ON public.homestead_chores
  TO authenticated USING (public.is_family_authorized(user_id));
CREATE INDEX IF NOT EXISTS homestead_chores_user_id_idx  ON public.homestead_chores USING btree (user_id);
CREATE INDEX IF NOT EXISTS homestead_chores_next_due_idx ON public.homestead_chores USING btree (next_due_date) WHERE is_active;
GRANT ALL ON TABLE public.homestead_chores TO anon, authenticated, service_role;

-- One row per time a chore is marked done. Carries the SAME credit shape as livestock_logs/
-- garden_entries/preservation_logs (child_ids/subject_ids/credit_hours + school_credit), so the
-- homeschool reports + transcript pick it up as a 4th homestead-credit source with one added fetch.
CREATE TABLE IF NOT EXISTS public.chore_completions (
  id             uuid DEFAULT gen_random_uuid() NOT NULL,
  user_id        uuid NOT NULL,
  chore_id       uuid NOT NULL,
  completed_date date NOT NULL DEFAULT CURRENT_DATE,
  school_credit  boolean NOT NULL DEFAULT false,
  child_ids      uuid[] NOT NULL DEFAULT '{}',
  subject_ids    uuid[] NOT NULL DEFAULT '{}',
  credit_hours   numeric,
  created_at     timestamptz DEFAULT now() NOT NULL,
  CONSTRAINT chore_completions_pkey PRIMARY KEY (id),
  CONSTRAINT chore_completions_user_id_fkey FOREIGN KEY (user_id)
    REFERENCES auth.users(id) ON DELETE CASCADE,
  CONSTRAINT chore_completions_chore_id_fkey FOREIGN KEY (chore_id)
    REFERENCES public.homestead_chores(id) ON DELETE CASCADE,
  -- The no-guessing rule, enforced at the DB: crediting school requires a named child + hours.
  -- Use cardinality() not array_length(): array_length('{}',1) is NULL, and a CHECK passes on
  -- NULL, so an empty child_ids would slip past. cardinality('{}') = 0, which correctly fails.
  CONSTRAINT chore_completions_credit_needs_child CHECK (
    NOT school_credit OR (cardinality(child_ids) >= 1 AND credit_hours IS NOT NULL)
  ),
  CONSTRAINT chore_completions_credit_hours_nonneg CHECK (credit_hours IS NULL OR credit_hours >= 0)
);

ALTER TABLE public.chore_completions OWNER TO postgres;
ALTER TABLE public.chore_completions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Family access chore_completions" ON public.chore_completions
  TO authenticated USING (public.is_family_authorized(user_id));
CREATE INDEX IF NOT EXISTS chore_completions_chore_id_idx ON public.chore_completions USING btree (chore_id);
CREATE INDEX IF NOT EXISTS chore_completions_user_id_idx  ON public.chore_completions USING btree (user_id);
GRANT ALL ON TABLE public.chore_completions TO anon, authenticated, service_role;
