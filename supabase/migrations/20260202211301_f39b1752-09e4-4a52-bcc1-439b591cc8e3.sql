-- Canadian Provincial Tax Rates reference table
CREATE TABLE public.provincial_tax_rates (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  province_code TEXT NOT NULL UNIQUE,
  province_name TEXT NOT NULL,
  gst_rate NUMERIC NOT NULL DEFAULT 5,
  hst_rate NUMERIC DEFAULT NULL,
  pst_rate NUMERIC DEFAULT NULL,
  qst_rate NUMERIC DEFAULT NULL,
  total_rate NUMERIC GENERATED ALWAYS AS (
    COALESCE(hst_rate, gst_rate + COALESCE(pst_rate, 0) + COALESCE(qst_rate, 0))
  ) STORED,
  is_hst_province BOOLEAN DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Insert Canadian provincial tax rates
INSERT INTO public.provincial_tax_rates (province_code, province_name, gst_rate, hst_rate, pst_rate, qst_rate, is_hst_province) VALUES
('BC', 'British Columbia', 5, NULL, 7, NULL, false),
('AB', 'Alberta', 5, NULL, NULL, NULL, false),
('SK', 'Saskatchewan', 5, NULL, 6, NULL, false),
('MB', 'Manitoba', 5, NULL, 7, NULL, false),
('ON', 'Ontario', 5, 13, NULL, NULL, true),
('QC', 'Quebec', 5, NULL, NULL, 9.975, false),
('NB', 'New Brunswick', 5, 15, NULL, NULL, true),
('NS', 'Nova Scotia', 5, 15, NULL, NULL, true),
('PE', 'Prince Edward Island', 5, 15, NULL, NULL, true),
('NL', 'Newfoundland and Labrador', 5, 15, NULL, NULL, true),
('NT', 'Northwest Territories', 5, NULL, NULL, NULL, false),
('NU', 'Nunavut', 5, NULL, NULL, NULL, false),
('YT', 'Yukon', 5, NULL, NULL, NULL, false);

-- Tax periods for filing
CREATE TABLE public.tax_filing_periods (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id UUID REFERENCES public.companies(id),
  period_type TEXT NOT NULL CHECK (period_type IN ('monthly', 'quarterly', 'annual')),
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  filing_due_date DATE NOT NULL,
  gst_hst_collected NUMERIC DEFAULT 0,
  qst_collected NUMERIC DEFAULT 0,
  pst_collected NUMERIC DEFAULT 0,
  itc_claimed NUMERIC DEFAULT 0,
  net_tax_payable NUMERIC DEFAULT 0,
  status TEXT DEFAULT 'open' CHECK (status IN ('open', 'filed', 'paid')),
  filed_date DATE,
  filed_by UUID,
  payment_date DATE,
  payment_amount NUMERIC,
  payment_reference TEXT,
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Tax collected on sales (detailed breakdown)
CREATE TABLE public.sales_tax_details (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  sale_id UUID REFERENCES public.sales(id) ON DELETE CASCADE,
  company_id UUID REFERENCES public.companies(id),
  customer_province TEXT,
  gst_amount NUMERIC DEFAULT 0,
  hst_amount NUMERIC DEFAULT 0,
  pst_amount NUMERIC DEFAULT 0,
  qst_amount NUMERIC DEFAULT 0,
  total_tax NUMERIC GENERATED ALWAYS AS (gst_amount + hst_amount + pst_amount + qst_amount) STORED,
  is_marketplace_collected BOOLEAN DEFAULT false,
  marketplace TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Input Tax Credits tracking
CREATE TABLE public.input_tax_credits (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id UUID REFERENCES public.companies(id),
  expense_id UUID REFERENCES public.expenses(id),
  ap_id UUID REFERENCES public.accounts_payable(id),
  reference_type TEXT NOT NULL CHECK (reference_type IN ('expense', 'ap', 'other')),
  reference_number TEXT,
  vendor_name TEXT,
  expense_date DATE NOT NULL,
  gst_hst_amount NUMERIC NOT NULL DEFAULT 0,
  qst_amount NUMERIC DEFAULT 0,
  is_eligible BOOLEAN DEFAULT true,
  eligibility_percentage NUMERIC DEFAULT 100,
  claimable_amount NUMERIC GENERATED ALWAYS AS (
    (gst_hst_amount + COALESCE(qst_amount, 0)) * eligibility_percentage / 100
  ) STORED,
  category TEXT,
  notes TEXT,
  filing_period_id UUID REFERENCES public.tax_filing_periods(id),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Tax remittances/payments
CREATE TABLE public.tax_remittances (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id UUID REFERENCES public.companies(id),
  filing_period_id UUID REFERENCES public.tax_filing_periods(id),
  tax_type TEXT NOT NULL CHECK (tax_type IN ('gst_hst', 'qst', 'pst')),
  payment_date DATE NOT NULL,
  amount NUMERIC NOT NULL,
  payment_method TEXT,
  confirmation_number TEXT,
  notes TEXT,
  created_by UUID,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.provincial_tax_rates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tax_filing_periods ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sales_tax_details ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.input_tax_credits ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tax_remittances ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Everyone can view tax rates" ON public.provincial_tax_rates
  FOR SELECT USING (true);

CREATE POLICY "Users can view tax periods for their companies" ON public.tax_filing_periods
  FOR SELECT USING (is_super_admin(auth.uid()) OR has_company_access(auth.uid(), company_id));

CREATE POLICY "Users with permission can manage tax periods" ON public.tax_filing_periods
  FOR ALL USING (has_permission(auth.uid(), company_id, 'taxes_manage', 'edit'));

CREATE POLICY "Users can view sales tax for their companies" ON public.sales_tax_details
  FOR SELECT USING (is_super_admin(auth.uid()) OR has_company_access(auth.uid(), company_id));

CREATE POLICY "Users with permission can manage sales tax" ON public.sales_tax_details
  FOR ALL USING (has_permission(auth.uid(), company_id, 'taxes_manage', 'edit'));

CREATE POLICY "Users can view ITCs for their companies" ON public.input_tax_credits
  FOR SELECT USING (is_super_admin(auth.uid()) OR has_company_access(auth.uid(), company_id));

CREATE POLICY "Users with permission can manage ITCs" ON public.input_tax_credits
  FOR ALL USING (has_permission(auth.uid(), company_id, 'taxes_manage', 'edit'));

CREATE POLICY "Users can view remittances for their companies" ON public.tax_remittances
  FOR SELECT USING (is_super_admin(auth.uid()) OR has_company_access(auth.uid(), company_id));

CREATE POLICY "Users with permission can manage remittances" ON public.tax_remittances
  FOR ALL USING (has_permission(auth.uid(), company_id, 'taxes_manage', 'edit'));

-- Add taxes_manage permission if not exists
INSERT INTO public.permissions (module, name, code, description) 
VALUES ('Taxes', 'Manage Taxes', 'taxes_manage', 'Manage tax filings, ITCs, and remittances')
ON CONFLICT DO NOTHING;

-- Triggers
CREATE TRIGGER update_tax_filing_periods_updated_at BEFORE UPDATE ON public.tax_filing_periods
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Indexes
CREATE INDEX idx_tfp_company ON public.tax_filing_periods(company_id);
CREATE INDEX idx_tfp_period ON public.tax_filing_periods(period_start, period_end);
CREATE INDEX idx_std_sale ON public.sales_tax_details(sale_id);
CREATE INDEX idx_std_company ON public.sales_tax_details(company_id);
CREATE INDEX idx_itc_company ON public.input_tax_credits(company_id);
CREATE INDEX idx_itc_period ON public.input_tax_credits(filing_period_id);
CREATE INDEX idx_tr_company ON public.tax_remittances(company_id);