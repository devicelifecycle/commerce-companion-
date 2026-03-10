-- Allow users with invoices_manage permission to INSERT AR entries (for invoice creation)
CREATE POLICY "Users with invoice permission can create AR entries"
ON public.accounts_receivable
FOR INSERT
TO authenticated
WITH CHECK (
  has_permission(auth.uid(), company_id, 'invoices_manage'::text, 'create'::text)
  OR has_permission(auth.uid(), company_id, 'accounting_manage'::text, 'create'::text)
);

-- Also allow users with sales permission to insert AR entries (for sale accounting)
CREATE POLICY "Users with sales permission can create AR entries"
ON public.accounts_receivable
FOR INSERT
TO authenticated
WITH CHECK (
  has_permission(auth.uid(), company_id, 'sales_manage'::text, 'create'::text)
);