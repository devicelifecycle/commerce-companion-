-- Add marketplace_source column to customers table
ALTER TABLE public.customers ADD COLUMN IF NOT EXISTS marketplace_source text;

-- Add phone column if not exists (already exists per schema)
-- Ensure we have an index on email+company_id for efficient upserts
CREATE INDEX IF NOT EXISTS idx_customers_email_company ON public.customers (email, company_id) WHERE email IS NOT NULL;

-- Add index on name+company_id for fallback matching
CREATE INDEX IF NOT EXISTS idx_customers_name_company ON public.customers (name, company_id);
