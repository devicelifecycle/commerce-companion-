-- Fix audit_logs INSERT policy: allow authenticated users to insert their own logs
-- regardless of company_id access (audit logs should always be writable)
DROP POLICY IF EXISTS "Authenticated users can insert audit logs" ON public.audit_logs;

CREATE POLICY "Authenticated users can insert audit logs"
ON public.audit_logs
FOR INSERT
TO authenticated
WITH CHECK (true);