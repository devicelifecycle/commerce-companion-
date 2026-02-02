-- Company settings table for profiles (separate migration to avoid partial failures)
CREATE TABLE public.company_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID REFERENCES public.companies(id) ON DELETE CASCADE NOT NULL UNIQUE,
  legal_name TEXT,
  business_number TEXT,
  gst_hst_number TEXT,
  qst_number TEXT,
  address_line1 TEXT,
  address_line2 TEXT,
  city TEXT,
  province TEXT,
  postal_code TEXT,
  phone TEXT,
  email TEXT,
  website TEXT,
  logo_url TEXT,
  fiscal_year_start INTEGER DEFAULT 1,
  default_currency TEXT DEFAULT 'CAD',
  invoice_prefix TEXT,
  invoice_next_number INTEGER DEFAULT 1001,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- App settings (global)
CREATE TABLE public.app_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID REFERENCES public.companies(id) ON DELETE CASCADE NOT NULL UNIQUE,
  low_inventory_threshold INTEGER DEFAULT 5,
  large_expense_threshold NUMERIC(12,2) DEFAULT 1000,
  auto_approve_expenses_under NUMERIC(12,2) DEFAULT 100,
  default_payment_terms INTEGER DEFAULT 30,
  default_ves_allocation NUMERIC(5,2) DEFAULT 50,
  default_tgw_allocation NUMERIC(5,2) DEFAULT 50,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.company_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.app_settings ENABLE ROW LEVEL SECURITY;

-- Company settings policies
CREATE POLICY "Users can view company settings they have access to" ON public.company_settings
  FOR SELECT TO authenticated
  USING (has_company_access(auth.uid(), company_id));

CREATE POLICY "Admins can manage company settings" ON public.company_settings
  FOR ALL TO authenticated
  USING (
    is_super_admin(auth.uid()) OR 
    get_user_role(auth.uid(), company_id) IN ('super_admin', 'company_admin')
  )
  WITH CHECK (
    is_super_admin(auth.uid()) OR 
    get_user_role(auth.uid(), company_id) IN ('super_admin', 'company_admin')
  );

-- App settings policies  
CREATE POLICY "Users can view app settings they have access to" ON public.app_settings
  FOR SELECT TO authenticated
  USING (has_company_access(auth.uid(), company_id));

CREATE POLICY "Admins can manage app settings" ON public.app_settings
  FOR ALL TO authenticated
  USING (
    is_super_admin(auth.uid()) OR 
    get_user_role(auth.uid(), company_id) IN ('super_admin', 'company_admin')
  )
  WITH CHECK (
    is_super_admin(auth.uid()) OR 
    get_user_role(auth.uid(), company_id) IN ('super_admin', 'company_admin')
  );