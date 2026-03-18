
-- Table for recording payments against purchase orders
CREATE TABLE public.po_payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  purchase_order_id uuid NOT NULL REFERENCES public.purchase_orders(id) ON DELETE CASCADE,
  payment_date date NOT NULL DEFAULT CURRENT_DATE,
  amount numeric NOT NULL,
  payment_method text,
  reference_number text,
  notes text,
  created_by uuid,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE public.po_payments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view PO payments"
  ON public.po_payments FOR SELECT TO public
  USING (EXISTS (
    SELECT 1 FROM purchase_orders po
    WHERE po.id = po_payments.purchase_order_id
    AND (is_super_admin(auth.uid()) OR has_company_access(auth.uid(), po.company_id))
  ));

CREATE POLICY "Users with permission can manage PO payments"
  ON public.po_payments FOR ALL TO public
  USING (EXISTS (
    SELECT 1 FROM purchase_orders po
    WHERE po.id = po_payments.purchase_order_id
    AND has_permission(auth.uid(), po.company_id, 'inventory_manage'::text, 'edit'::text)
  ));

-- Add created_by tracking to purchase_orders if not storing profile info
-- Add paid_amount column for easier tracking
ALTER TABLE public.purchase_orders ADD COLUMN IF NOT EXISTS paid_amount numeric DEFAULT 0;
