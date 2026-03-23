CREATE POLICY "Users with inventory permission can create AP from imports"
ON public.accounts_payable
FOR INSERT
TO authenticated
WITH CHECK (
  has_permission(auth.uid(), company_id, 'inventory_manage'::text, 'create'::text)
);