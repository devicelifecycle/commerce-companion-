-- Fix expense_refunds RLS: the ALL policy needs WITH CHECK for INSERT to work
-- Drop and recreate with proper WITH CHECK clause
DROP POLICY IF EXISTS "Users with permission can manage refunds" ON public.expense_refunds;

CREATE POLICY "Users with permission can manage refunds"
ON public.expense_refunds
FOR ALL
TO authenticated
USING (
  has_permission(auth.uid(), company_id, 'expenses_manage'::text, 'edit'::text)
  OR (company_id IS NULL AND is_super_admin(auth.uid()))
)
WITH CHECK (
  has_permission(auth.uid(), company_id, 'expenses_manage'::text, 'edit'::text)
  OR (company_id IS NULL AND is_super_admin(auth.uid()))
);

-- Also fix the SELECT policy to handle NULL company_id (shared expenses)
DROP POLICY IF EXISTS "Users can view refunds for their companies" ON public.expense_refunds;

CREATE POLICY "Users can view refunds for their companies"
ON public.expense_refunds
FOR SELECT
TO authenticated
USING (
  is_super_admin(auth.uid())
  OR has_company_access(auth.uid(), company_id)
  OR company_id IS NULL
);