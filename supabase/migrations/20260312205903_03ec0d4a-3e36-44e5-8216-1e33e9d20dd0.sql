
-- Create sale_items table for multi-line item orders
CREATE TABLE public.sale_items (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  sale_id UUID NOT NULL REFERENCES public.sales(id) ON DELETE CASCADE,
  device_id UUID REFERENCES public.devices(id),
  description TEXT NOT NULL,
  quantity INTEGER NOT NULL DEFAULT 1,
  unit_price NUMERIC NOT NULL,
  cost_price NUMERIC DEFAULT 0,
  discount NUMERIC DEFAULT 0,
  tax_amount NUMERIC DEFAULT 0,
  total NUMERIC NOT NULL,
  sku TEXT,
  imei TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.sale_items ENABLE ROW LEVEL SECURITY;

-- RLS: Users can view sale items for sales they can access
CREATE POLICY "Users can view sale items"
  ON public.sale_items FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.sales s
      WHERE s.id = sale_items.sale_id
      AND (is_super_admin(auth.uid()) OR has_company_access(auth.uid(), s.company_id))
    )
  );

-- RLS: Users with sales permission can manage sale items
CREATE POLICY "Users with permission can manage sale items"
  ON public.sale_items FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.sales s
      WHERE s.id = sale_items.sale_id
      AND has_permission(auth.uid(), s.company_id, 'sales_manage', 'edit')
    )
  );

-- Add is_multi_item flag to sales table for backwards compatibility
ALTER TABLE public.sales ADD COLUMN IF NOT EXISTS is_multi_item BOOLEAN DEFAULT false;
ALTER TABLE public.sales ADD COLUMN IF NOT EXISTS item_count INTEGER DEFAULT 1;
ALTER TABLE public.sales ADD COLUMN IF NOT EXISTS subtotal NUMERIC DEFAULT 0;
