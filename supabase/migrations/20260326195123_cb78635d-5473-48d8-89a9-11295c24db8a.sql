
-- Refurbishment checklist items per device
CREATE TABLE public.device_refurbishment_tasks (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  device_id UUID NOT NULL REFERENCES public.devices(id) ON DELETE CASCADE,
  company_id UUID REFERENCES public.companies(id),
  task_name TEXT NOT NULL,
  is_completed BOOLEAN NOT NULL DEFAULT false,
  is_custom BOOLEAN NOT NULL DEFAULT false,
  notes TEXT,
  completed_at TIMESTAMP WITH TIME ZONE,
  completed_by UUID,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Parts used during refurbishment (links to repair_parts)
CREATE TABLE public.device_refurbishment_parts (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  device_id UUID NOT NULL REFERENCES public.devices(id) ON DELETE CASCADE,
  repair_part_id UUID NOT NULL REFERENCES public.repair_parts(id),
  company_id UUID REFERENCES public.companies(id),
  quantity_used INTEGER NOT NULL DEFAULT 1,
  unit_cost NUMERIC NOT NULL DEFAULT 0,
  total_cost NUMERIC NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  created_by UUID
);

-- Add refurbishment status tracking to devices
ALTER TABLE public.devices 
  ADD COLUMN IF NOT EXISTS refurbishment_status TEXT DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS refurbishment_labor_cost NUMERIC DEFAULT 0,
  ADD COLUMN IF NOT EXISTS refurbishment_notes TEXT DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS refurbishment_started_at TIMESTAMP WITH TIME ZONE DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS refurbishment_completed_at TIMESTAMP WITH TIME ZONE DEFAULT NULL;

-- RLS for refurbishment tasks
ALTER TABLE public.device_refurbishment_tasks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view refurbishment tasks for their companies"
  ON public.device_refurbishment_tasks FOR SELECT
  TO authenticated
  USING (is_super_admin(auth.uid()) OR has_company_access(auth.uid(), company_id));

CREATE POLICY "Users with permission can manage refurbishment tasks"
  ON public.device_refurbishment_tasks FOR ALL
  TO authenticated
  USING (has_permission(auth.uid(), company_id, 'inventory_manage', 'edit'))
  WITH CHECK (has_permission(auth.uid(), company_id, 'inventory_manage', 'edit'));

-- RLS for refurbishment parts
ALTER TABLE public.device_refurbishment_parts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view refurbishment parts for their companies"
  ON public.device_refurbishment_parts FOR SELECT
  TO authenticated
  USING (is_super_admin(auth.uid()) OR has_company_access(auth.uid(), company_id));

CREATE POLICY "Users with permission can manage refurbishment parts"
  ON public.device_refurbishment_parts FOR ALL
  TO authenticated
  USING (has_permission(auth.uid(), company_id, 'inventory_manage', 'edit'))
  WITH CHECK (has_permission(auth.uid(), company_id, 'inventory_manage', 'edit'));
