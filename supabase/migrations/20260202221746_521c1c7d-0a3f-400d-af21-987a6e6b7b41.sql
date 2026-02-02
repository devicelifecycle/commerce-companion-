-- MODULE 7 & 8: Purchase Orders, Goods Received Notes, Return Authorizations

-- Purchase Orders table
CREATE TABLE public.purchase_orders (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id UUID REFERENCES public.companies(id),
  po_number TEXT NOT NULL,
  supplier_id UUID REFERENCES public.suppliers(id),
  supplier_name TEXT NOT NULL,
  po_date DATE NOT NULL DEFAULT CURRENT_DATE,
  expected_delivery_date DATE,
  subtotal NUMERIC NOT NULL DEFAULT 0,
  gst_hst_amount NUMERIC DEFAULT 0,
  pst_qst_amount NUMERIC DEFAULT 0,
  total_amount NUMERIC NOT NULL DEFAULT 0,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'partial', 'received', 'cancelled')),
  payment_status TEXT DEFAULT 'unpaid' CHECK (payment_status IN ('unpaid', 'partial', 'paid')),
  payment_date DATE,
  payment_method TEXT,
  payment_reference TEXT,
  notes TEXT,
  created_by UUID,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Purchase Order Items
CREATE TABLE public.purchase_order_items (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  purchase_order_id UUID NOT NULL REFERENCES public.purchase_orders(id) ON DELETE CASCADE,
  device_id UUID REFERENCES public.devices(id),
  description TEXT NOT NULL,
  quantity INTEGER NOT NULL DEFAULT 1,
  unit_cost NUMERIC NOT NULL,
  gst_hst_amount NUMERIC DEFAULT 0,
  pst_qst_amount NUMERIC DEFAULT 0,
  total_cost NUMERIC NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Goods Received Notes table
CREATE TABLE public.goods_received_notes (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id UUID REFERENCES public.companies(id),
  grn_number TEXT NOT NULL,
  purchase_order_id UUID REFERENCES public.purchase_orders(id),
  supplier_id UUID REFERENCES public.suppliers(id),
  received_date DATE NOT NULL DEFAULT CURRENT_DATE,
  received_by UUID,
  status TEXT DEFAULT 'completed' CHECK (status IN ('pending', 'partial', 'completed', 'rejected')),
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- GRN Items
CREATE TABLE public.grn_items (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  grn_id UUID NOT NULL REFERENCES public.goods_received_notes(id) ON DELETE CASCADE,
  purchase_order_item_id UUID REFERENCES public.purchase_order_items(id),
  device_id UUID REFERENCES public.devices(id),
  quantity_received INTEGER NOT NULL DEFAULT 1,
  condition_status TEXT DEFAULT 'passed' CHECK (condition_status IN ('passed', 'damaged', 'rejected')),
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Return Authorizations (RMA) table
CREATE TABLE public.return_authorizations (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id UUID REFERENCES public.companies(id),
  rma_number TEXT NOT NULL,
  return_type TEXT NOT NULL CHECK (return_type IN ('purchase_return', 'sales_return')),
  -- For purchase returns (to supplier)
  supplier_id UUID REFERENCES public.suppliers(id),
  purchase_order_id UUID REFERENCES public.purchase_orders(id),
  -- For sales returns (from customer)
  sale_id UUID REFERENCES public.sales(id),
  customer_name TEXT,
  -- Common fields
  device_id UUID REFERENCES public.devices(id),
  return_date DATE NOT NULL DEFAULT CURRENT_DATE,
  reason TEXT NOT NULL,
  original_cost NUMERIC,
  refund_amount NUMERIC,
  refund_date DATE,
  refund_method TEXT,
  tax_refunded NUMERIC DEFAULT 0,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'shipped', 'received', 'refunded', 'cancelled')),
  notes TEXT,
  created_by UUID,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Sequences for auto-numbering
CREATE SEQUENCE IF NOT EXISTS po_number_seq START 1;
CREATE SEQUENCE IF NOT EXISTS grn_number_seq START 1;
CREATE SEQUENCE IF NOT EXISTS rma_number_seq START 1;

-- Enable RLS
ALTER TABLE public.purchase_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.purchase_order_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.goods_received_notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.grn_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.return_authorizations ENABLE ROW LEVEL SECURITY;

-- RLS Policies for purchase_orders
CREATE POLICY "Users can view POs for their companies"
  ON public.purchase_orders FOR SELECT
  USING (is_super_admin(auth.uid()) OR has_company_access(auth.uid(), company_id));

CREATE POLICY "Users with permission can manage POs"
  ON public.purchase_orders FOR ALL
  USING (has_permission(auth.uid(), company_id, 'inventory_manage', 'edit'));

-- RLS Policies for purchase_order_items
CREATE POLICY "Users can view PO items"
  ON public.purchase_order_items FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM purchase_orders po 
    WHERE po.id = purchase_order_items.purchase_order_id 
    AND (is_super_admin(auth.uid()) OR has_company_access(auth.uid(), po.company_id))
  ));

CREATE POLICY "Users with permission can manage PO items"
  ON public.purchase_order_items FOR ALL
  USING (EXISTS (
    SELECT 1 FROM purchase_orders po 
    WHERE po.id = purchase_order_items.purchase_order_id 
    AND has_permission(auth.uid(), po.company_id, 'inventory_manage', 'edit')
  ));

-- RLS Policies for goods_received_notes
CREATE POLICY "Users can view GRNs for their companies"
  ON public.goods_received_notes FOR SELECT
  USING (is_super_admin(auth.uid()) OR has_company_access(auth.uid(), company_id));

CREATE POLICY "Users with permission can manage GRNs"
  ON public.goods_received_notes FOR ALL
  USING (has_permission(auth.uid(), company_id, 'inventory_manage', 'edit'));

-- RLS Policies for grn_items
CREATE POLICY "Users can view GRN items"
  ON public.grn_items FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM goods_received_notes grn 
    WHERE grn.id = grn_items.grn_id 
    AND (is_super_admin(auth.uid()) OR has_company_access(auth.uid(), grn.company_id))
  ));

CREATE POLICY "Users with permission can manage GRN items"
  ON public.grn_items FOR ALL
  USING (EXISTS (
    SELECT 1 FROM goods_received_notes grn 
    WHERE grn.id = grn_items.grn_id 
    AND has_permission(auth.uid(), grn.company_id, 'inventory_manage', 'edit')
  ));

-- RLS Policies for return_authorizations
CREATE POLICY "Users can view RMAs for their companies"
  ON public.return_authorizations FOR SELECT
  USING (is_super_admin(auth.uid()) OR has_company_access(auth.uid(), company_id));

CREATE POLICY "Users with permission can manage RMAs"
  ON public.return_authorizations FOR ALL
  USING (has_permission(auth.uid(), company_id, 'inventory_manage', 'edit'));

-- Add indexes for performance
CREATE INDEX idx_purchase_orders_company ON public.purchase_orders(company_id);
CREATE INDEX idx_purchase_orders_supplier ON public.purchase_orders(supplier_id);
CREATE INDEX idx_purchase_orders_status ON public.purchase_orders(status);
CREATE INDEX idx_goods_received_notes_company ON public.goods_received_notes(company_id);
CREATE INDEX idx_goods_received_notes_po ON public.goods_received_notes(purchase_order_id);
CREATE INDEX idx_return_authorizations_company ON public.return_authorizations(company_id);
CREATE INDEX idx_return_authorizations_type ON public.return_authorizations(return_type);
CREATE INDEX idx_return_authorizations_status ON public.return_authorizations(status);