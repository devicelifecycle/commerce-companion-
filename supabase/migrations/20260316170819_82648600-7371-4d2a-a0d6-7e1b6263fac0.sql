
-- Product categories (open-ended)
CREATE TABLE public.product_categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid REFERENCES public.companies(id) ON DELETE CASCADE,
  name text NOT NULL,
  description text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(company_id, name)
);

ALTER TABLE public.product_categories ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view categories for their companies" ON public.product_categories
  FOR SELECT TO public USING (is_super_admin(auth.uid()) OR has_company_access(auth.uid(), company_id));

CREATE POLICY "Users with permission can manage categories" ON public.product_categories
  FOR ALL TO public USING (has_permission(auth.uid(), company_id, 'inventory_manage', 'edit'));

-- Products table (quantity-based generic inventory)
CREATE TABLE public.products (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid REFERENCES public.companies(id) ON DELETE CASCADE,
  category_id uuid REFERENCES public.product_categories(id) ON DELETE SET NULL,
  name text NOT NULL,
  description text,
  sku text,
  barcode text,
  unit_of_measure text NOT NULL DEFAULT 'unit',
  cost_price numeric NOT NULL DEFAULT 0,
  sale_price numeric,
  quantity_on_hand integer NOT NULL DEFAULT 0,
  reorder_point integer NOT NULL DEFAULT 0,
  supplier_id uuid REFERENCES public.suppliers(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'active',
  notes text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view products for their companies" ON public.products
  FOR SELECT TO authenticated USING (is_super_admin(auth.uid()) OR has_company_access(auth.uid(), company_id));

CREATE POLICY "Users with permission can manage products" ON public.products
  FOR ALL TO authenticated USING (has_permission(auth.uid(), company_id, 'inventory_manage', 'edit'));

-- Product lots / batch tracking
CREATE TABLE public.product_lots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  lot_number text NOT NULL,
  quantity integer NOT NULL DEFAULT 0,
  cost_price numeric NOT NULL DEFAULT 0,
  expiry_date date,
  received_date date NOT NULL DEFAULT CURRENT_DATE,
  supplier_id uuid REFERENCES public.suppliers(id) ON DELETE SET NULL,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.product_lots ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view lots" ON public.product_lots
  FOR SELECT TO authenticated USING (EXISTS (
    SELECT 1 FROM public.products p WHERE p.id = product_lots.product_id
    AND (is_super_admin(auth.uid()) OR has_company_access(auth.uid(), p.company_id))
  ));

CREATE POLICY "Users with permission can manage lots" ON public.product_lots
  FOR ALL TO authenticated USING (EXISTS (
    SELECT 1 FROM public.products p WHERE p.id = product_lots.product_id
    AND has_permission(auth.uid(), p.company_id, 'inventory_manage', 'edit')
  ));

-- Add product_id to sale_items
ALTER TABLE public.sale_items ADD COLUMN IF NOT EXISTS product_id uuid REFERENCES public.products(id) ON DELETE SET NULL;

-- Add product_id to purchase_order_items
ALTER TABLE public.purchase_order_items ADD COLUMN IF NOT EXISTS product_id uuid REFERENCES public.products(id) ON DELETE SET NULL;

-- Add product_id to grn_items
ALTER TABLE public.grn_items ADD COLUMN IF NOT EXISTS product_id uuid REFERENCES public.products(id) ON DELETE SET NULL;

-- Seed default categories for each company
INSERT INTO public.product_categories (company_id, name, description)
SELECT c.id, cat.name, cat.description
FROM public.companies c
CROSS JOIN (VALUES 
  ('Electronics', 'Phones, laptops, tablets, accessories'),
  ('Food & Beverage', 'Food items, drinks, snacks'),
  ('General Merchandise', 'Miscellaneous products')
) AS cat(name, description);
