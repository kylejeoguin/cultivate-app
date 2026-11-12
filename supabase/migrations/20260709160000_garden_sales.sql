-- Garden sales: a crop you sell is revenue, and until now there was nowhere to put it.
--
-- `livestock_logs` has had disposition/sale_amount/sale_qty since the beginning; every revenue
-- figure in the app (Homestead Reports, Intelligence, Project reports, the Yearbook) reads them.
-- `garden_entries` had none. The AI log's router happily parses "sold 10 lbs of tomatoes for $20"
-- and the save path silently discarded the $20 — a silent zero on the homestead-as-business
-- promise, and the reason "cost vs yield per crop" could show a cost and a yield but never a return.
--
-- Columns mirror livestock exactly so the read surfaces stay symmetric (one mental model, not two).
--
-- Constraints (make illegal states unrepresentable — same posture as P2a):
--   * disposition ∈ (personal, sold, mixed), NULL = not stated
--   * sale_amount / sale_qty are non-negative when present
--   * a sale requires a harvest: you cannot sell a crop that is still in the ground.
--     Existing rows all have NULL sale columns, so this is satisfied on arrival.

ALTER TABLE public.garden_entries
  ADD COLUMN IF NOT EXISTS disposition text,
  ADD COLUMN IF NOT EXISTS sale_amount numeric,
  ADD COLUMN IF NOT EXISTS sale_qty    numeric;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'garden_entries_disposition_check') THEN
    ALTER TABLE public.garden_entries
      ADD CONSTRAINT garden_entries_disposition_check
      CHECK (disposition IS NULL OR disposition = ANY (ARRAY['personal'::text, 'sold'::text, 'mixed'::text]));
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'garden_entries_sale_amount_nonneg') THEN
    ALTER TABLE public.garden_entries
      ADD CONSTRAINT garden_entries_sale_amount_nonneg
      CHECK (sale_amount IS NULL OR sale_amount >= 0);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'garden_entries_sale_qty_nonneg') THEN
    ALTER TABLE public.garden_entries
      ADD CONSTRAINT garden_entries_sale_qty_nonneg
      CHECK (sale_qty IS NULL OR sale_qty >= 0);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'garden_entries_sale_needs_harvest') THEN
    ALTER TABLE public.garden_entries
      ADD CONSTRAINT garden_entries_sale_needs_harvest
      CHECK (sale_amount IS NULL OR status = 'harvested');
  END IF;
END $$;

-- Revenue reads filter on disposition; index the rows that actually carry money.
CREATE INDEX IF NOT EXISTS garden_entries_sold_idx
  ON public.garden_entries (user_id)
  WHERE disposition IN ('sold', 'mixed');
