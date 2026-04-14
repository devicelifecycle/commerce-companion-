-- Create invoice revenue accounts
INSERT INTO public.chart_of_accounts (company_id, account_code, account_name, account_type, account_subtype, normal_balance, is_system_account, description)
VALUES
  ('4e0fa3a6-06a9-4618-8513-f66143c05b28', '4400', 'Direct / Invoice Sales - VES', 'revenue', 'other_revenue', 'credit', true, 'Revenue from direct invoices and off-marketplace sales for VES'),
  ('de25878a-f1c0-4f0a-99e1-25a0e143e641', '4401', 'Direct / Invoice Sales - TGW', 'revenue', 'other_revenue', 'credit', true, 'Revenue from direct invoices and off-marketplace sales for TGW');

-- Allow invoice managers to update AR records (for recording payments)
CREATE POLICY "Users with invoice permission can update AR"
ON public.accounts_receivable
FOR UPDATE
TO authenticated
USING (has_permission(auth.uid(), company_id, 'invoices_manage'::text, 'edit'::text));

-- Allow invoice managers to insert AR payments
CREATE POLICY "Users with invoice permission can create AR payments"
ON public.ar_payments
FOR INSERT
TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM accounts_receivable ar
    WHERE ar.id = ar_payments.accounts_receivable_id
    AND has_permission(auth.uid(), ar.company_id, 'invoices_manage'::text, 'create'::text)
  )
);

-- Allow invoice managers to delete AR payments (for payment reversal)
CREATE POLICY "Users with invoice permission can delete AR payments"
ON public.ar_payments
FOR DELETE
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM accounts_receivable ar
    WHERE ar.id = ar_payments.accounts_receivable_id
    AND has_permission(auth.uid(), ar.company_id, 'invoices_manage'::text, 'edit'::text)
  )
);