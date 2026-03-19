
-- Repair parts inventory
CREATE TABLE public.repair_parts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid REFERENCES public.companies(id),
  name text NOT NULL,
  sku text,
  description text,
  category text DEFAULT 'general',
  unit_cost numeric NOT NULL DEFAULT 0,
  quantity_on_hand integer NOT NULL DEFAULT 0,
  reorder_point integer DEFAULT 5,
  supplier_id uuid REFERENCES public.suppliers(id),
  is_active boolean DEFAULT true,
  created_by uuid,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Device repairs (repair jobs)
CREATE TABLE public.device_repairs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  device_id uuid NOT NULL REFERENCES public.devices(id) ON DELETE CASCADE,
  company_id uuid REFERENCES public.companies(id),
  status text NOT NULL DEFAULT 'in_progress',
  started_at timestamptz DEFAULT now(),
  completed_at timestamptz,
  total_parts_cost numeric DEFAULT 0,
  total_labor_cost numeric DEFAULT 0,
  notes text,
  created_by uuid,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Repair line items (parts used + labor entries)
CREATE TABLE public.repair_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  repair_id uuid NOT NULL REFERENCES public.device_repairs(id) ON DELETE CASCADE,
  item_type text NOT NULL DEFAULT 'part',
  repair_part_id uuid REFERENCES public.repair_parts(id),
  description text NOT NULL,
  quantity integer NOT NULL DEFAULT 1,
  unit_cost numeric NOT NULL DEFAULT 0,
  total_cost numeric NOT NULL DEFAULT 0,
  labor_hours numeric,
  labor_rate numeric,
  created_at timestamptz DEFAULT now()
);

-- RLS for repair_parts
ALTER TABLE public.repair_parts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view repair parts for their companies"
  ON public.repair_parts FOR SELECT TO authenticated
  USING (is_super_admin(auth.uid()) OR has_company_access(auth.uid(), company_id));

CREATE POLICY "Users with permission can manage repair parts"
  ON public.repair_parts FOR ALL TO authenticated
  USING (has_permission(auth.uid(), company_id, 'inventory_manage'::text, 'edit'::text))
  WITH CHECK (has_permission(auth.uid(), company_id, 'inventory_manage'::text, 'edit'::text));

-- RLS for device_repairs
ALTER TABLE public.device_repairs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view repairs for their companies"
  ON public.device_repairs FOR SELECT TO authenticated
  USING (is_super_admin(auth.uid()) OR has_company_access(auth.uid(), company_id));

CREATE POLICY "Users with permission can manage repairs"
  ON public.device_repairs FOR ALL TO authenticated
  USING (has_permission(auth.uid(), company_id, 'inventory_manage'::text, 'edit'::text))
  WITH CHECK (has_permission(auth.uid(), company_id, 'inventory_manage'::text, 'edit'::text));

-- RLS for repair_items
ALTER TABLE public.repair_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view repair items"
  ON public.repair_items FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.device_repairs dr
    WHERE dr.id = repair_items.repair_id
    AND (is_super_admin(auth.uid()) OR has_company_access(auth.uid(), dr.company_id))
  ));

CREATE POLICY "Users with permission can manage repair items"
  ON public.repair_items FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.device_repairs dr
    WHERE dr.id = repair_items.repair_id
    AND has_permission(auth.uid(), dr.company_id, 'inventory_manage'::text, 'edit'::text)
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.device_repairs dr
    WHERE dr.id = repair_items.repair_id
    AND has_permission(auth.uid(), dr.company_id, 'inventory_manage'::text, 'edit'::text)
  ));
