-- Add category and sku fields to devices table
ALTER TABLE public.devices
ADD COLUMN IF NOT EXISTS category text DEFAULT 'phone',
ADD COLUMN IF NOT EXISTS sku text;

-- Create unique index on SKU per company
CREATE UNIQUE INDEX IF NOT EXISTS devices_sku_company_unique 
ON public.devices(sku, company_id) 
WHERE sku IS NOT NULL;

-- Create index on IMEI for faster duplicate checking
CREATE INDEX IF NOT EXISTS devices_imei_idx ON public.devices(imei) WHERE imei IS NOT NULL;

-- Create inventory_transfers table for inter-company transfers
CREATE TABLE IF NOT EXISTS public.inventory_transfers (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  device_id uuid REFERENCES public.devices(id) ON DELETE CASCADE,
  from_company_id uuid REFERENCES public.companies(id),
  to_company_id uuid REFERENCES public.companies(id),
  transfer_date timestamp with time zone NOT NULL DEFAULT now(),
  transfer_price numeric,
  reason text,
  notes text,
  created_by uuid,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Enable RLS on inventory_transfers
ALTER TABLE public.inventory_transfers ENABLE ROW LEVEL SECURITY;

-- RLS policies for inventory_transfers
CREATE POLICY "Users can view transfers for their companies"
ON public.inventory_transfers FOR SELECT
USING (
  is_super_admin(auth.uid()) 
  OR has_company_access(auth.uid(), from_company_id)
  OR has_company_access(auth.uid(), to_company_id)
);

CREATE POLICY "Users with permission can create transfers"
ON public.inventory_transfers FOR INSERT
WITH CHECK (
  has_permission(auth.uid(), from_company_id, 'inventory_manage', 'create')
);

-- Add inventory_transfer permission if not exists
INSERT INTO public.permissions (module, code, name, description)
VALUES ('inventory', 'inventory_transfer', 'Inventory Transfer', 'Transfer inventory between companies')
ON CONFLICT (code) DO NOTHING;

-- Grant inventory_transfer permission to appropriate roles
INSERT INTO public.role_permissions (role, permission_id, can_view, can_create, can_edit, can_delete)
SELECT 'super_admin', id, true, true, true, true FROM public.permissions WHERE code = 'inventory_transfer'
ON CONFLICT DO NOTHING;

INSERT INTO public.role_permissions (role, permission_id, can_view, can_create, can_edit, can_delete)
SELECT 'company_admin', id, true, true, true, false FROM public.permissions WHERE code = 'inventory_transfer'
ON CONFLICT DO NOTHING;

INSERT INTO public.role_permissions (role, permission_id, can_view, can_create, can_edit, can_delete)
SELECT 'operations_staff', id, true, true, false, false FROM public.permissions WHERE code = 'inventory_transfer'
ON CONFLICT DO NOTHING;