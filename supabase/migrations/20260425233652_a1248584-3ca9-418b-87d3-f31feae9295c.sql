-- 1. Add missing device_status enum values
ALTER TYPE public.device_status ADD VALUE IF NOT EXISTS 'in_repair';
ALTER TYPE public.device_status ADD VALUE IF NOT EXISTS 'refurbished';
ALTER TYPE public.device_status ADD VALUE IF NOT EXISTS 'reserved';

-- 2. Tighten audit_logs insert policy
DROP POLICY IF EXISTS "Authenticated users can insert audit logs" ON public.audit_logs;
CREATE POLICY "Authenticated users can insert audit logs"
ON public.audit_logs
FOR INSERT
TO authenticated
WITH CHECK (
  user_id = auth.uid()
  AND (
    company_id IS NULL
    OR public.is_super_admin(auth.uid())
    OR public.has_company_access(auth.uid(), company_id)
  )
);

-- 3. Restrict service-role policies to service_role only (silences linter)
DROP POLICY IF EXISTS "Service role can insert validation issues" ON public.data_validation_issues;
CREATE POLICY "Service role can insert validation issues"
ON public.data_validation_issues
FOR INSERT
TO service_role
WITH CHECK (true);

DROP POLICY IF EXISTS "Service role can insert payouts" ON public.marketplace_payouts;
CREATE POLICY "Service role can insert payouts"
ON public.marketplace_payouts
FOR INSERT
TO service_role
WITH CHECK (true);

DROP POLICY IF EXISTS "Service role can insert notifications" ON public.notifications;
CREATE POLICY "Service role can insert notifications"
ON public.notifications
FOR INSERT
TO service_role
WITH CHECK (true);

DROP POLICY IF EXISTS "Service role can insert sync logs" ON public.sync_logs;
CREATE POLICY "Service role can insert sync logs"
ON public.sync_logs
FOR INSERT
TO service_role
WITH CHECK (true);

DROP POLICY IF EXISTS "Service role can insert system alerts" ON public.system_alerts;
CREATE POLICY "Service role can insert system alerts"
ON public.system_alerts
FOR INSERT
TO service_role
WITH CHECK (true);

DROP POLICY IF EXISTS "Service role can update system alerts" ON public.system_alerts;
CREATE POLICY "Service role can update system alerts"
ON public.system_alerts
FOR UPDATE
TO service_role
USING (true);