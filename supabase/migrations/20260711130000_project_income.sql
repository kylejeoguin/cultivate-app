-- Direct project income ledger — the income twin of project_expenses.
--
-- Why: project revenue was ONLY ever derived from livestock_logs / garden_entries rows that
-- happened to carry the project_id and were marked sold. That means:
--   * Home & DIY projects (build-and-sell a bench, flip furniture) could record NO revenue at all
--     — the only revenue-bearing tables are homestead ones, so their net was structurally always
--     a loss.
--   * No lump-sum / misc income (selling the finished coop itself, firewood, custom work, a
--     roadside cash sale) had anywhere to be recorded against the project.
-- This is the direct, user-entered income side, mirroring project_expenses exactly so the report
-- can compute net = (homestead sales tagged to the project) + (direct income) - expenses.
--
-- This is for income the homestead tables genuinely can't derive. A livestock/garden sale already
-- tagged to the project still flows through homesteadRevenue() — do not double-enter it here (the
-- UI guides the user on this).

CREATE TABLE IF NOT EXISTS public.project_income (
  id           uuid DEFAULT gen_random_uuid() NOT NULL,
  project_id   uuid NOT NULL,
  user_id      uuid NOT NULL,
  amount       numeric(10,2) NOT NULL,
  description  text NOT NULL,
  income_date  date DEFAULT CURRENT_DATE NOT NULL,
  source       text,          -- buyer / channel, the income analogue of expenses.store
  notes        text,
  created_at   timestamp with time zone DEFAULT now(),
  CONSTRAINT project_income_pkey PRIMARY KEY (id),
  CONSTRAINT project_income_amount_check CHECK (amount >= 0),
  CONSTRAINT project_income_project_id_fkey FOREIGN KEY (project_id)
    REFERENCES public.projects(id) ON DELETE CASCADE,
  CONSTRAINT project_income_user_id_fkey FOREIGN KEY (user_id)
    REFERENCES auth.users(id) ON DELETE CASCADE
);

ALTER TABLE public.project_income OWNER TO postgres;
ALTER TABLE public.project_income ENABLE ROW LEVEL SECURITY;

-- Same family-aware access as project_expenses. USING doubles as WITH CHECK for INSERT, so a user
-- (or an accepted family member) can only write rows they own.
CREATE POLICY "Family access project_income" ON public.project_income
  TO authenticated USING (public.is_family_authorized(user_id));

CREATE INDEX IF NOT EXISTS project_income_project_id_idx ON public.project_income USING btree (project_id);
CREATE INDEX IF NOT EXISTS idx_project_income_user_id  ON public.project_income USING btree (user_id);

GRANT ALL ON TABLE public.project_income TO anon;
GRANT ALL ON TABLE public.project_income TO authenticated;
GRANT ALL ON TABLE public.project_income TO service_role;
