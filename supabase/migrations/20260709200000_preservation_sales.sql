-- Preservation sales. A jar of jam sold at the farmstand is revenue, same as an egg or a tomato.
--
-- livestock_logs and (since 20260709160000) garden_entries carry disposition/sale_amount/sale_qty;
-- preservation_logs did not, so the Preservation QuickLog had to hide its "Sold some?" box, and
-- the AI log silently discarded a parsed preservation sale. Columns mirror the other two exactly
-- so lib/revenue.ts stays ONE helper: homesteadRevenue() now sums all three.
--
-- No `sale_needs_harvest` analogue here: unlike a crop, a preservation row IS the finished batch —
-- there is no lifecycle stage that makes a sale impossible.

ALTER TABLE public.preservation_logs
  ADD COLUMN IF NOT EXISTS disposition text,
  ADD COLUMN IF NOT EXISTS sale_amount numeric,
  ADD COLUMN IF NOT EXISTS sale_qty    numeric;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'preservation_logs_disposition_check') THEN
    ALTER TABLE public.preservation_logs
      ADD CONSTRAINT preservation_logs_disposition_check
      CHECK (disposition IS NULL OR disposition = ANY (ARRAY['personal'::text, 'sold'::text, 'mixed'::text]));
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'preservation_logs_sale_amount_nonneg') THEN
    ALTER TABLE public.preservation_logs
      ADD CONSTRAINT preservation_logs_sale_amount_nonneg
      CHECK (sale_amount IS NULL OR sale_amount >= 0);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'preservation_logs_sale_qty_nonneg') THEN
    ALTER TABLE public.preservation_logs
      ADD CONSTRAINT preservation_logs_sale_qty_nonneg
      CHECK (sale_qty IS NULL OR sale_qty >= 0);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS preservation_logs_sold_idx
  ON public.preservation_logs (user_id)
  WHERE disposition IN ('sold', 'mixed');
