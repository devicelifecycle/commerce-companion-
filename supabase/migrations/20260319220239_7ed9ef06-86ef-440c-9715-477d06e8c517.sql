
-- Add original_cost_price to devices to track pre-repair cost
ALTER TABLE public.devices ADD COLUMN original_cost_price numeric;

-- Backfill: set original_cost_price = cost_price for all existing devices
UPDATE public.devices SET original_cost_price = cost_price WHERE original_cost_price IS NULL;
