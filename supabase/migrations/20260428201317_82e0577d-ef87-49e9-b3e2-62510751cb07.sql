
ALTER TABLE public.purchase_orders
  ADD COLUMN IF NOT EXISTS parent_po_id uuid REFERENCES public.purchase_orders(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS back_order_po_id uuid REFERENCES public.purchase_orders(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_purchase_orders_parent_po_id ON public.purchase_orders(parent_po_id);

ALTER TABLE public.purchase_orders DROP CONSTRAINT IF EXISTS purchase_orders_status_check;
ALTER TABLE public.purchase_orders ADD CONSTRAINT purchase_orders_status_check
  CHECK (status = ANY (ARRAY['pending'::text, 'partial'::text, 'partially_received'::text, 'received'::text, 'cancelled'::text, 'back_ordered'::text]));
