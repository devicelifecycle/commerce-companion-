
CREATE TABLE public.system_alerts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  alert_type text NOT NULL,
  severity text NOT NULL DEFAULT 'warning',
  source text NOT NULL,
  title text NOT NULL,
  message text NOT NULL,
  details jsonb DEFAULT null,
  is_dismissed boolean NOT NULL DEFAULT false,
  dismissed_by uuid DEFAULT null,
  dismissed_at timestamptz DEFAULT null,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT system_alerts_severity_check CHECK (severity IN ('info', 'warning', 'critical'))
);

ALTER TABLE public.system_alerts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view system alerts"
  ON public.system_alerts FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "Admins can manage system alerts"
  ON public.system_alerts FOR ALL TO authenticated
  USING (is_super_admin(auth.uid()));

CREATE POLICY "Service role can insert system alerts"
  ON public.system_alerts FOR INSERT TO service_role
  WITH CHECK (true);

CREATE POLICY "Service role can update system alerts"
  ON public.system_alerts FOR UPDATE TO service_role
  USING (true);
