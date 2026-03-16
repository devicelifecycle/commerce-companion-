
ALTER TABLE public.customers
  ADD COLUMN IF NOT EXISTS street_address text,
  ADD COLUMN IF NOT EXISTS city text,
  ADD COLUMN IF NOT EXISTS province text,
  ADD COLUMN IF NOT EXISTS postal_code text,
  ADD COLUMN IF NOT EXISTS country text DEFAULT 'Canada',
  ADD COLUMN IF NOT EXISTS channel text DEFAULT NULL;

UPDATE public.customers SET street_address = address WHERE address IS NOT NULL AND street_address IS NULL;
