
ALTER TABLE public.sales
  ADD COLUMN IF NOT EXISTS product_title text DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS marketplace_sku text DEFAULT NULL;

COMMENT ON COLUMN public.sales.product_title IS 'Product name/title from marketplace listing';
COMMENT ON COLUMN public.sales.marketplace_sku IS 'SKU/offer ID from the marketplace';
