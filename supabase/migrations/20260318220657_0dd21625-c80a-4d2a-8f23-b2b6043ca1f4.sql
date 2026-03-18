
-- Create expense_refunds table
CREATE TABLE public.expense_refunds (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  expense_id UUID NOT NULL REFERENCES public.expenses(id) ON DELETE CASCADE,
  company_id UUID REFERENCES public.companies(id),
  refund_amount NUMERIC NOT NULL,
  refund_date DATE NOT NULL DEFAULT CURRENT_DATE,
  reason TEXT,
  refund_method TEXT,
  reference_number TEXT,
  notes TEXT,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.expense_refunds ENABLE ROW LEVEL SECURITY;

-- View policy
CREATE POLICY "Users can view refunds for their companies"
ON public.expense_refunds
FOR SELECT
TO authenticated
USING (
  is_super_admin(auth.uid()) OR has_company_access(auth.uid(), company_id)
);

-- Manage policy
CREATE POLICY "Users with permission can manage refunds"
ON public.expense_refunds
FOR ALL
TO authenticated
USING (
  has_permission(auth.uid(), company_id, 'expenses_manage', 'edit')
);
