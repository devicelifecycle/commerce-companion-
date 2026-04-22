ALTER TABLE public.sales 
  ADD COLUMN IF NOT EXISTS marketplace_total_tax numeric,
  ADD COLUMN IF NOT EXISTS marketplace_total_shipping numeric;

COMMENT ON COLUMN public.sales.marketplace_total_tax IS 'Authoritative total_tax reported by the marketplace (Shopify total_tax, etc.). Used to detect drift vs tax_amount before posting.';
COMMENT ON COLUMN public.sales.marketplace_total_shipping IS 'Authoritative total_shipping reported by the marketplace (Shopify total_shipping_price_set). Used to detect drift vs shipping_revenue before posting.';

CREATE INDEX IF NOT EXISTS idx_sales_marketplace_tax_drift ON public.sales (marketplace) WHERE marketplace_total_tax IS NOT NULL;