-- Drop existing policy first, then create new one
DROP POLICY IF EXISTS "Users can view audit logs for their companies" ON public.audit_logs;

CREATE POLICY "Users can view audit logs for their companies" ON public.audit_logs
FOR SELECT TO authenticated
USING (
  is_super_admin(auth.uid()) OR 
  has_company_access(auth.uid(), company_id)
);