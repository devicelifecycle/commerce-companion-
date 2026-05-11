
-- =========================================================
-- PARTNER CONSIGNMENT MODULE
-- =========================================================

CREATE TABLE public.partners (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL,
  name text NOT NULL,
  contact_name text,
  email text,
  phone text,
  address text,
  commission_pct numeric NOT NULL DEFAULT 15,
  default_labor_rate numeric DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  agreement_start_date date,
  notes text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_partners_company ON public.partners(company_id);

CREATE TABLE public.partner_intake_batches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  partner_id uuid NOT NULL REFERENCES public.partners(id) ON DELETE CASCADE,
  company_id uuid NOT NULL,
  batch_number text NOT NULL,
  received_date date NOT NULL DEFAULT CURRENT_DATE,
  manifest_url text,
  total_units integer DEFAULT 0,
  notes text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_pib_partner ON public.partner_intake_batches(partner_id);

CREATE TABLE public.partner_devices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  partner_id uuid NOT NULL REFERENCES public.partners(id) ON DELETE RESTRICT,
  company_id uuid NOT NULL,
  intake_batch_id uuid REFERENCES public.partner_intake_batches(id) ON DELETE SET NULL,
  intake_date date NOT NULL DEFAULT CURRENT_DATE,
  category text DEFAULT 'phone',
  brand text,
  model text NOT NULL,
  identifier text, -- IMEI/SN
  storage text,
  color text,
  cosmetic_grade text,
  partner_cost numeric DEFAULT 0,           -- informational, NOT in GL
  refurb_fee numeric DEFAULT 0,             -- manual per device
  refurb_fee_status text NOT NULL DEFAULT 'pending', -- pending|accrued|netted|invoiced|settled
  status text NOT NULL DEFAULT 'received',
    -- received|testing|tested|refurbishing|refurbished|listed|sold|returned_to_partner|written_off
  disposition text,                          -- null|list_for_sale|return_to_partner
  device_id uuid,                            -- linked synth device row when listed
  notes text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_partner_devices_partner ON public.partner_devices(partner_id);
CREATE INDEX idx_partner_devices_company ON public.partner_devices(company_id);
CREATE INDEX idx_partner_devices_status ON public.partner_devices(status);
CREATE INDEX idx_partner_devices_device ON public.partner_devices(device_id);

CREATE TABLE public.partner_device_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  partner_device_id uuid NOT NULL REFERENCES public.partner_devices(id) ON DELETE CASCADE,
  partner_id uuid NOT NULL,
  company_id uuid NOT NULL,
  event_type text NOT NULL,
  payload jsonb,
  user_id uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_pde_device ON public.partner_device_events(partner_device_id, created_at DESC);

CREATE TABLE public.partner_device_parts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  partner_device_id uuid NOT NULL REFERENCES public.partner_devices(id) ON DELETE CASCADE,
  company_id uuid NOT NULL,
  repair_part_id uuid,
  part_name text,
  qty numeric NOT NULL DEFAULT 1,
  unit_cost numeric NOT NULL DEFAULT 0,
  total_cost numeric GENERATED ALWAYS AS (qty * unit_cost) STORED,
  used_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid
);

CREATE INDEX idx_pdp_device ON public.partner_device_parts(partner_device_id);

CREATE TABLE public.partner_device_labor (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  partner_device_id uuid NOT NULL REFERENCES public.partner_devices(id) ON DELETE CASCADE,
  company_id uuid NOT NULL,
  hours numeric NOT NULL DEFAULT 0,
  rate numeric NOT NULL DEFAULT 0,
  total_cost numeric GENERATED ALWAYS AS (hours * rate) STORED,
  description text,
  logged_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid
);

CREATE INDEX idx_pdl_device ON public.partner_device_labor(partner_device_id);

CREATE TABLE public.partner_sales (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  partner_id uuid NOT NULL REFERENCES public.partners(id) ON DELETE RESTRICT,
  partner_device_id uuid REFERENCES public.partner_devices(id) ON DELETE SET NULL,
  sale_id uuid,
  company_id uuid NOT NULL,
  channel text,
  sale_date date NOT NULL DEFAULT CURRENT_DATE,
  sale_amount numeric NOT NULL DEFAULT 0,
  partner_cost numeric NOT NULL DEFAULT 0,
  marketplace_fees numeric NOT NULL DEFAULT 0,
  shipping numeric NOT NULL DEFAULT 0,
  tax numeric NOT NULL DEFAULT 0,
  refurb_fee numeric NOT NULL DEFAULT 0,
  net_profit numeric NOT NULL DEFAULT 0,             -- sale - cost - fees - shipping - tax - refurb_fee
  commission_pct numeric NOT NULL DEFAULT 15,
  commission_amount numeric NOT NULL DEFAULT 0,      -- OUR income (net_profit * pct)
  partner_proceeds numeric NOT NULL DEFAULT 0,       -- owed back to partner
  status text NOT NULL DEFAULT 'accrued',            -- accrued|settled|reversed
  settlement_id uuid,
  settled_at timestamptz,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_partner_sales_partner ON public.partner_sales(partner_id);
CREATE INDEX idx_partner_sales_device ON public.partner_sales(partner_device_id);
CREATE INDEX idx_partner_sales_sale ON public.partner_sales(sale_id);
CREATE INDEX idx_partner_sales_status ON public.partner_sales(status);

CREATE TABLE public.partner_payables (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  partner_id uuid NOT NULL REFERENCES public.partners(id) ON DELETE RESTRICT,
  partner_sale_id uuid REFERENCES public.partner_sales(id) ON DELETE CASCADE,
  company_id uuid NOT NULL,
  amount numeric NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'accrued',  -- accrued|settled|reversed
  settlement_id uuid,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_pp_partner ON public.partner_payables(partner_id, status);

CREATE TABLE public.partner_receivables (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  partner_id uuid NOT NULL REFERENCES public.partners(id) ON DELETE RESTRICT,
  partner_device_id uuid REFERENCES public.partner_devices(id) ON DELETE SET NULL,
  company_id uuid NOT NULL,
  fee_type text NOT NULL DEFAULT 'refurb_fee',
  amount numeric NOT NULL DEFAULT 0,
  billed_date date NOT NULL DEFAULT CURRENT_DATE,
  status text NOT NULL DEFAULT 'pending', -- pending|invoiced|netted|paid|reversed
  settlement_id uuid,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_pr_partner ON public.partner_receivables(partner_id, status);

CREATE TABLE public.partner_settlements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  partner_id uuid NOT NULL REFERENCES public.partners(id) ON DELETE RESTRICT,
  company_id uuid NOT NULL,
  period_start date NOT NULL,
  period_end date NOT NULL,
  total_payable numeric NOT NULL DEFAULT 0,
  total_receivable numeric NOT NULL DEFAULT 0,
  net_amount numeric NOT NULL DEFAULT 0,
  direction text NOT NULL DEFAULT 'pay',  -- pay|collect
  status text NOT NULL DEFAULT 'draft',   -- draft|finalized|paid
  paid_date date,
  payment_method text,
  reference text,
  statement_pdf_url text,
  notes text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_psettlements_partner ON public.partner_settlements(partner_id);

-- Extend devices + sales (additive, default safe)
ALTER TABLE public.devices
  ADD COLUMN IF NOT EXISTS is_partner_owned boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS partner_device_id uuid;

ALTER TABLE public.sales
  ADD COLUMN IF NOT EXISTS is_partner_sale boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS partner_id uuid,
  ADD COLUMN IF NOT EXISTS partner_device_id uuid;

CREATE INDEX IF NOT EXISTS idx_devices_partner_owned ON public.devices(is_partner_owned) WHERE is_partner_owned = true;
CREATE INDEX IF NOT EXISTS idx_sales_partner ON public.sales(is_partner_sale) WHERE is_partner_sale = true;

-- updated_at triggers
CREATE TRIGGER trg_partners_updated BEFORE UPDATE ON public.partners
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_partner_devices_updated BEFORE UPDATE ON public.partner_devices
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_partner_sales_updated BEFORE UPDATE ON public.partner_sales
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_partner_payables_updated BEFORE UPDATE ON public.partner_payables
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_partner_receivables_updated BEFORE UPDATE ON public.partner_receivables
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_partner_settlements_updated BEFORE UPDATE ON public.partner_settlements
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- =========================================================
-- RLS
-- =========================================================
ALTER TABLE public.partners ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.partner_intake_batches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.partner_devices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.partner_device_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.partner_device_parts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.partner_device_labor ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.partner_sales ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.partner_payables ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.partner_receivables ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.partner_settlements ENABLE ROW LEVEL SECURITY;

-- View policies (company access)
CREATE POLICY "view_partners" ON public.partners FOR SELECT
  USING (is_super_admin(auth.uid()) OR has_company_access(auth.uid(), company_id));
CREATE POLICY "manage_partners" ON public.partners FOR ALL
  USING (is_super_admin(auth.uid()) OR get_user_role(auth.uid(), company_id) = 'admin'::user_role)
  WITH CHECK (is_super_admin(auth.uid()) OR get_user_role(auth.uid(), company_id) = 'admin'::user_role);

CREATE POLICY "view_pib" ON public.partner_intake_batches FOR SELECT
  USING (is_super_admin(auth.uid()) OR has_company_access(auth.uid(), company_id));
CREATE POLICY "manage_pib" ON public.partner_intake_batches FOR ALL
  USING (has_permission(auth.uid(), company_id, 'inventory_manage', 'edit'))
  WITH CHECK (has_permission(auth.uid(), company_id, 'inventory_manage', 'edit'));

CREATE POLICY "view_partner_devices" ON public.partner_devices FOR SELECT
  USING (is_super_admin(auth.uid()) OR has_company_access(auth.uid(), company_id));
CREATE POLICY "manage_partner_devices" ON public.partner_devices FOR ALL
  USING (has_permission(auth.uid(), company_id, 'inventory_manage', 'edit'))
  WITH CHECK (has_permission(auth.uid(), company_id, 'inventory_manage', 'edit'));

CREATE POLICY "view_pde" ON public.partner_device_events FOR SELECT
  USING (is_super_admin(auth.uid()) OR has_company_access(auth.uid(), company_id));
CREATE POLICY "insert_pde" ON public.partner_device_events FOR INSERT
  WITH CHECK (is_super_admin(auth.uid()) OR has_company_access(auth.uid(), company_id));

CREATE POLICY "view_pdp" ON public.partner_device_parts FOR SELECT
  USING (is_super_admin(auth.uid()) OR has_company_access(auth.uid(), company_id));
CREATE POLICY "manage_pdp" ON public.partner_device_parts FOR ALL
  USING (has_permission(auth.uid(), company_id, 'inventory_manage', 'edit'))
  WITH CHECK (has_permission(auth.uid(), company_id, 'inventory_manage', 'edit'));

CREATE POLICY "view_pdl" ON public.partner_device_labor FOR SELECT
  USING (is_super_admin(auth.uid()) OR has_company_access(auth.uid(), company_id));
CREATE POLICY "manage_pdl" ON public.partner_device_labor FOR ALL
  USING (has_permission(auth.uid(), company_id, 'inventory_manage', 'edit'))
  WITH CHECK (has_permission(auth.uid(), company_id, 'inventory_manage', 'edit'));

CREATE POLICY "view_partner_sales" ON public.partner_sales FOR SELECT
  USING (is_super_admin(auth.uid()) OR has_company_access(auth.uid(), company_id));
CREATE POLICY "manage_partner_sales" ON public.partner_sales FOR ALL
  USING (has_permission(auth.uid(), company_id, 'accounting_manage', 'edit'))
  WITH CHECK (has_permission(auth.uid(), company_id, 'accounting_manage', 'edit'));

CREATE POLICY "view_partner_payables" ON public.partner_payables FOR SELECT
  USING (is_super_admin(auth.uid()) OR has_company_access(auth.uid(), company_id));
CREATE POLICY "manage_partner_payables" ON public.partner_payables FOR ALL
  USING (has_permission(auth.uid(), company_id, 'accounting_manage', 'edit'))
  WITH CHECK (has_permission(auth.uid(), company_id, 'accounting_manage', 'edit'));

CREATE POLICY "view_partner_receivables" ON public.partner_receivables FOR SELECT
  USING (is_super_admin(auth.uid()) OR has_company_access(auth.uid(), company_id));
CREATE POLICY "manage_partner_receivables" ON public.partner_receivables FOR ALL
  USING (has_permission(auth.uid(), company_id, 'accounting_manage', 'edit'))
  WITH CHECK (has_permission(auth.uid(), company_id, 'accounting_manage', 'edit'));

CREATE POLICY "view_partner_settlements" ON public.partner_settlements FOR SELECT
  USING (is_super_admin(auth.uid()) OR has_company_access(auth.uid(), company_id));
CREATE POLICY "manage_partner_settlements" ON public.partner_settlements FOR ALL
  USING (has_permission(auth.uid(), company_id, 'accounting_manage', 'edit'))
  WITH CHECK (has_permission(auth.uid(), company_id, 'accounting_manage', 'edit'));
