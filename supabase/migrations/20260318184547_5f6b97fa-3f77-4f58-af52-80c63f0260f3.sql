-- SKU/UPC master product catalog to prevent duplicate entries
CREATE TABLE public.product_catalog (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  brand text NOT NULL,
  model text NOT NULL,
  storage text,
  color text,
  category text DEFAULT 'phone',
  upc text,
  ean text,
  internal_sku_prefix text,
  normalized_key text NOT NULL,
  default_cost_price numeric,
  default_sale_price numeric,
  is_active boolean DEFAULT true,
  notes text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(normalized_key)
);

-- Index for fast lookups
CREATE INDEX idx_product_catalog_normalized_key ON public.product_catalog(normalized_key);
CREATE INDEX idx_product_catalog_upc ON public.product_catalog(upc) WHERE upc IS NOT NULL;

-- Enable RLS
ALTER TABLE public.product_catalog ENABLE ROW LEVEL SECURITY;

-- Everyone authenticated can view
CREATE POLICY "Authenticated users can view product catalog"
  ON public.product_catalog FOR SELECT TO authenticated
  USING (true);

-- Admins can manage
CREATE POLICY "Admins can manage product catalog"
  ON public.product_catalog FOR ALL TO authenticated
  USING (is_super_admin(auth.uid()))
  WITH CHECK (is_super_admin(auth.uid()));

-- Updated_at trigger
CREATE TRIGGER update_product_catalog_updated_at
  BEFORE UPDATE ON public.product_catalog
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();