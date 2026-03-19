
-- Allow authenticated admins to insert system alerts from the UI
CREATE POLICY "Admins can insert system alerts"
  ON public.system_alerts FOR INSERT TO authenticated
  WITH CHECK (is_super_admin(auth.uid()));

-- Allow authenticated admins to update (dismiss) system alerts  
CREATE POLICY "Admins can update system alerts"
  ON public.system_alerts FOR UPDATE TO authenticated
  USING (is_super_admin(auth.uid()));
