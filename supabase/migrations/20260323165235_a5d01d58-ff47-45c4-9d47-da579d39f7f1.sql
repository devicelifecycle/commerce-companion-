-- Add po_type to purchase_orders (inventory vs repair_parts)
ALTER TABLE public.purchase_orders ADD COLUMN po_type text NOT NULL DEFAULT 'inventory';

-- Add management labor fields to devices
ALTER TABLE public.devices ADD COLUMN management_labor_cost numeric;
ALTER TABLE public.devices ADD COLUMN management_labor_hours numeric;