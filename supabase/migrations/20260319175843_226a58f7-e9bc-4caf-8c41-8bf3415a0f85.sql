
ALTER TABLE public.sales 
ADD COLUMN IF NOT EXISTS manual_cost numeric DEFAULT NULL,
ADD COLUMN IF NOT EXISTS manual_cost_description text DEFAULT NULL;

COMMENT ON COLUMN public.sales.manual_cost IS 'Manual direct cost override (e.g. labour, services) when no device/product is linked';
COMMENT ON COLUMN public.sales.manual_cost_description IS 'Description of the manual cost (e.g. labour hours, service fee)';
