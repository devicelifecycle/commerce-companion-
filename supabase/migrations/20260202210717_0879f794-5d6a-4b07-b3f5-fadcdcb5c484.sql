-- Chart of Accounts for Canadian GAAP
CREATE TABLE public.chart_of_accounts (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id UUID REFERENCES public.companies(id),
  account_code TEXT NOT NULL,
  account_name TEXT NOT NULL,
  account_type TEXT NOT NULL CHECK (account_type IN ('asset', 'liability', 'equity', 'revenue', 'expense')),
  account_subtype TEXT,
  parent_account_id UUID REFERENCES public.chart_of_accounts(id),
  description TEXT,
  is_active BOOLEAN DEFAULT true,
  opening_balance NUMERIC DEFAULT 0,
  current_balance NUMERIC DEFAULT 0,
  normal_balance TEXT CHECK (normal_balance IN ('debit', 'credit')),
  is_system_account BOOLEAN DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  UNIQUE(company_id, account_code)
);

-- Journal Entries header
CREATE TABLE public.journal_entries (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id UUID REFERENCES public.companies(id),
  entry_number TEXT NOT NULL,
  entry_date DATE NOT NULL DEFAULT CURRENT_DATE,
  description TEXT NOT NULL,
  reference_type TEXT,
  reference_id UUID,
  status TEXT DEFAULT 'draft' CHECK (status IN ('draft', 'pending', 'approved', 'posted', 'void')),
  total_debit NUMERIC DEFAULT 0,
  total_credit NUMERIC DEFAULT 0,
  is_auto_generated BOOLEAN DEFAULT false,
  approved_by UUID,
  approved_at TIMESTAMP WITH TIME ZONE,
  posted_by UUID,
  posted_at TIMESTAMP WITH TIME ZONE,
  created_by UUID,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Journal Entry Lines
CREATE TABLE public.journal_entry_lines (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  journal_entry_id UUID NOT NULL REFERENCES public.journal_entries(id) ON DELETE CASCADE,
  account_id UUID NOT NULL REFERENCES public.chart_of_accounts(id),
  description TEXT,
  debit_amount NUMERIC DEFAULT 0,
  credit_amount NUMERIC DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Accounts Receivable (marketplace payments, customer invoices)
CREATE TABLE public.accounts_receivable (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id UUID REFERENCES public.companies(id),
  source_type TEXT NOT NULL CHECK (source_type IN ('marketplace', 'invoice', 'other')),
  source_reference TEXT,
  marketplace TEXT,
  customer_name TEXT,
  invoice_id UUID REFERENCES public.invoices(id),
  original_amount NUMERIC NOT NULL,
  paid_amount NUMERIC DEFAULT 0,
  balance_due NUMERIC GENERATED ALWAYS AS (original_amount - paid_amount) STORED,
  due_date DATE NOT NULL,
  expected_payment_date DATE,
  status TEXT DEFAULT 'outstanding' CHECK (status IN ('outstanding', 'partial', 'paid', 'overdue', 'written_off')),
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- AR Payments
CREATE TABLE public.ar_payments (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  accounts_receivable_id UUID NOT NULL REFERENCES public.accounts_receivable(id),
  payment_date DATE NOT NULL DEFAULT CURRENT_DATE,
  amount NUMERIC NOT NULL,
  payment_method TEXT,
  reference_number TEXT,
  notes TEXT,
  created_by UUID,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Accounts Payable (vendor bills)
CREATE TABLE public.accounts_payable (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id UUID REFERENCES public.companies(id),
  vendor_id UUID REFERENCES public.vendors(id),
  vendor_name TEXT NOT NULL,
  bill_number TEXT,
  bill_date DATE NOT NULL DEFAULT CURRENT_DATE,
  due_date DATE NOT NULL,
  original_amount NUMERIC NOT NULL,
  paid_amount NUMERIC DEFAULT 0,
  balance_due NUMERIC GENERATED ALWAYS AS (original_amount - paid_amount) STORED,
  gst_hst_amount NUMERIC DEFAULT 0,
  pst_amount NUMERIC DEFAULT 0,
  status TEXT DEFAULT 'unpaid' CHECK (status IN ('unpaid', 'partial', 'paid', 'overdue', 'void')),
  description TEXT,
  category TEXT,
  payment_terms TEXT,
  notes TEXT,
  created_by UUID,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- AP Payments
CREATE TABLE public.ap_payments (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  accounts_payable_id UUID NOT NULL REFERENCES public.accounts_payable(id),
  payment_date DATE NOT NULL DEFAULT CURRENT_DATE,
  amount NUMERIC NOT NULL,
  payment_method TEXT,
  check_number TEXT,
  reference_number TEXT,
  notes TEXT,
  created_by UUID,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Bank Accounts for reconciliation
CREATE TABLE public.bank_accounts (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id UUID REFERENCES public.companies(id),
  account_name TEXT NOT NULL,
  bank_name TEXT,
  account_number TEXT,
  account_type TEXT DEFAULT 'checking',
  currency TEXT DEFAULT 'CAD',
  opening_balance NUMERIC DEFAULT 0,
  current_balance NUMERIC DEFAULT 0,
  last_reconciled_date DATE,
  last_reconciled_balance NUMERIC,
  is_active BOOLEAN DEFAULT true,
  chart_account_id UUID REFERENCES public.chart_of_accounts(id),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Bank Transactions (imported or manual)
CREATE TABLE public.bank_transactions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  bank_account_id UUID NOT NULL REFERENCES public.bank_accounts(id),
  transaction_date DATE NOT NULL,
  description TEXT,
  amount NUMERIC NOT NULL,
  transaction_type TEXT CHECK (transaction_type IN ('debit', 'credit')),
  reference_number TEXT,
  is_reconciled BOOLEAN DEFAULT false,
  reconciled_date DATE,
  matched_journal_entry_id UUID REFERENCES public.journal_entries(id),
  category TEXT,
  notes TEXT,
  imported_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Enable RLS on all tables
ALTER TABLE public.chart_of_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.journal_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.journal_entry_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.accounts_receivable ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ar_payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.accounts_payable ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ap_payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bank_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bank_transactions ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Users can view chart of accounts for their companies" ON public.chart_of_accounts
  FOR SELECT USING (is_super_admin(auth.uid()) OR has_company_access(auth.uid(), company_id));

CREATE POLICY "Users with permission can manage chart of accounts" ON public.chart_of_accounts
  FOR ALL USING (has_permission(auth.uid(), company_id, 'accounting_manage', 'edit'));

CREATE POLICY "Users can view journal entries for their companies" ON public.journal_entries
  FOR SELECT USING (is_super_admin(auth.uid()) OR has_company_access(auth.uid(), company_id));

CREATE POLICY "Users with permission can manage journal entries" ON public.journal_entries
  FOR ALL USING (has_permission(auth.uid(), company_id, 'accounting_manage', 'edit'));

CREATE POLICY "Users can view journal entry lines" ON public.journal_entry_lines
  FOR SELECT USING (EXISTS (
    SELECT 1 FROM public.journal_entries je 
    WHERE je.id = journal_entry_id 
    AND (is_super_admin(auth.uid()) OR has_company_access(auth.uid(), je.company_id))
  ));

CREATE POLICY "Users with permission can manage journal entry lines" ON public.journal_entry_lines
  FOR ALL USING (EXISTS (
    SELECT 1 FROM public.journal_entries je 
    WHERE je.id = journal_entry_id 
    AND has_permission(auth.uid(), je.company_id, 'accounting_manage', 'edit')
  ));

CREATE POLICY "Users can view AR for their companies" ON public.accounts_receivable
  FOR SELECT USING (is_super_admin(auth.uid()) OR has_company_access(auth.uid(), company_id));

CREATE POLICY "Users with permission can manage AR" ON public.accounts_receivable
  FOR ALL USING (has_permission(auth.uid(), company_id, 'accounting_manage', 'edit'));

CREATE POLICY "Users can view AR payments" ON public.ar_payments
  FOR SELECT USING (EXISTS (
    SELECT 1 FROM public.accounts_receivable ar 
    WHERE ar.id = accounts_receivable_id 
    AND (is_super_admin(auth.uid()) OR has_company_access(auth.uid(), ar.company_id))
  ));

CREATE POLICY "Users with permission can manage AR payments" ON public.ar_payments
  FOR ALL USING (EXISTS (
    SELECT 1 FROM public.accounts_receivable ar 
    WHERE ar.id = accounts_receivable_id 
    AND has_permission(auth.uid(), ar.company_id, 'accounting_manage', 'edit')
  ));

CREATE POLICY "Users can view AP for their companies" ON public.accounts_payable
  FOR SELECT USING (is_super_admin(auth.uid()) OR has_company_access(auth.uid(), company_id));

CREATE POLICY "Users with permission can manage AP" ON public.accounts_payable
  FOR ALL USING (has_permission(auth.uid(), company_id, 'accounting_manage', 'edit'));

CREATE POLICY "Users can view AP payments" ON public.ap_payments
  FOR SELECT USING (EXISTS (
    SELECT 1 FROM public.accounts_payable ap 
    WHERE ap.id = accounts_payable_id 
    AND (is_super_admin(auth.uid()) OR has_company_access(auth.uid(), ap.company_id))
  ));

CREATE POLICY "Users with permission can manage AP payments" ON public.ap_payments
  FOR ALL USING (EXISTS (
    SELECT 1 FROM public.accounts_payable ap 
    WHERE ap.id = accounts_payable_id 
    AND has_permission(auth.uid(), ap.company_id, 'accounting_manage', 'edit')
  ));

CREATE POLICY "Users can view bank accounts for their companies" ON public.bank_accounts
  FOR SELECT USING (is_super_admin(auth.uid()) OR has_company_access(auth.uid(), company_id));

CREATE POLICY "Users with permission can manage bank accounts" ON public.bank_accounts
  FOR ALL USING (has_permission(auth.uid(), company_id, 'accounting_manage', 'edit'));

CREATE POLICY "Users can view bank transactions" ON public.bank_transactions
  FOR SELECT USING (EXISTS (
    SELECT 1 FROM public.bank_accounts ba 
    WHERE ba.id = bank_account_id 
    AND (is_super_admin(auth.uid()) OR has_company_access(auth.uid(), ba.company_id))
  ));

CREATE POLICY "Users with permission can manage bank transactions" ON public.bank_transactions
  FOR ALL USING (EXISTS (
    SELECT 1 FROM public.bank_accounts ba 
    WHERE ba.id = bank_account_id 
    AND has_permission(auth.uid(), ba.company_id, 'accounting_manage', 'edit')
  ));

-- Add accounting_manage permission
INSERT INTO public.permissions (module, name, code, description) 
VALUES ('Accounting', 'Manage Accounting', 'accounting_manage', 'Create and manage journal entries, chart of accounts, AR/AP')
ON CONFLICT DO NOTHING;

-- Add updated_at triggers
CREATE TRIGGER update_chart_of_accounts_updated_at BEFORE UPDATE ON public.chart_of_accounts
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_journal_entries_updated_at BEFORE UPDATE ON public.journal_entries
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_accounts_receivable_updated_at BEFORE UPDATE ON public.accounts_receivable
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_accounts_payable_updated_at BEFORE UPDATE ON public.accounts_payable
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_bank_accounts_updated_at BEFORE UPDATE ON public.bank_accounts
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Create indexes for performance
CREATE INDEX idx_coa_company ON public.chart_of_accounts(company_id);
CREATE INDEX idx_coa_type ON public.chart_of_accounts(account_type);
CREATE INDEX idx_je_company ON public.journal_entries(company_id);
CREATE INDEX idx_je_date ON public.journal_entries(entry_date);
CREATE INDEX idx_jel_entry ON public.journal_entry_lines(journal_entry_id);
CREATE INDEX idx_ar_company ON public.accounts_receivable(company_id);
CREATE INDEX idx_ar_status ON public.accounts_receivable(status);
CREATE INDEX idx_ap_company ON public.accounts_payable(company_id);
CREATE INDEX idx_ap_status ON public.accounts_payable(status);
CREATE INDEX idx_bt_bank ON public.bank_transactions(bank_account_id);
CREATE INDEX idx_bt_date ON public.bank_transactions(transaction_date);