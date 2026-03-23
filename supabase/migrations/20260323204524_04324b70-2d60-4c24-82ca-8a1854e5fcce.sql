
CREATE TABLE public.repair_parts_catalog (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  normalized_key text NOT NULL,
  category text DEFAULT 'general',
  compatible_devices text DEFAULT NULL,
  default_cost numeric DEFAULT 0,
  sku_prefix text,
  is_active boolean DEFAULT true,
  notes text,
  created_at timestamptz DEFAULT now(),
  UNIQUE(normalized_key)
);

ALTER TABLE public.repair_parts_catalog ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view repair parts catalog"
  ON public.repair_parts_catalog FOR SELECT TO authenticated USING (true);

CREATE POLICY "Admins can manage repair parts catalog"
  ON public.repair_parts_catalog FOR ALL TO authenticated
  USING (is_super_admin(auth.uid()))
  WITH CHECK (is_super_admin(auth.uid()));
