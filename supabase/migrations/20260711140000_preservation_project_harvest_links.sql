-- Preservation & homestead-cost attribution: tag a batch / cost to a project or source harvest.
--
-- Kyle's ask (#6): "how are the preservation inputs and costs tracked... shouldn't we have a way
-- of tagging it to a project, animal, harvest?" Today homestead_inputs (costs) and preservation_logs
-- (batches) have NO relational link to anything but the user — costs are a flat per-category pool and
-- a jar of jam can't point at the project it belongs to or the harvest that fed it.
--
-- Adds nullable FKs (ON DELETE SET NULL, mirroring livestock_logs/garden_entries.project_id — deleting
-- a project nulls the tag, it never deletes the batch or the cost):
--   * homestead_inputs.project_id        -> a preservation/garden/livestock COST can roll into a project
--   * preservation_logs.project_id       -> a BATCH's sales flow into a project's report (like #5)
--   * preservation_logs.garden_entry_id  -> a BATCH traces to the garden harvest that fed it
--
-- Deferred (documented in docs/TICKET-project-preservation-income-tracking.md): per-BATCH cost ROI
-- (homestead_inputs.preservation_log_id) and animal attribution for preservation.

ALTER TABLE public.homestead_inputs
  ADD COLUMN IF NOT EXISTS project_id uuid REFERENCES public.projects(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS homestead_inputs_project_id_idx ON public.homestead_inputs USING btree (project_id);

ALTER TABLE public.preservation_logs
  ADD COLUMN IF NOT EXISTS project_id uuid REFERENCES public.projects(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS garden_entry_id uuid REFERENCES public.garden_entries(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS preservation_logs_project_id_idx ON public.preservation_logs USING btree (project_id);
CREATE INDEX IF NOT EXISTS preservation_logs_garden_entry_id_idx ON public.preservation_logs USING btree (garden_entry_id);
