-- Fix storage policies referencing deleted functions
DROP POLICY IF EXISTS "Team members can view receipts" ON storage.objects;
DROP POLICY IF EXISTS "Admins and managers can upload receipts" ON storage.objects;
DROP POLICY IF EXISTS "Admins and managers can update receipts" ON storage.objects;
DROP POLICY IF EXISTS "Admins can delete receipts" ON storage.objects;

-- Create new policies using the current permission system
CREATE POLICY "Users can view receipts"
ON storage.objects FOR SELECT
USING (
  bucket_id = 'receipts' AND
  EXISTS (
    SELECT 1 FROM public.user_company_assignments
    WHERE user_id = auth.uid()
  )
);

CREATE POLICY "Users with permission can upload receipts"
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'receipts' AND
  EXISTS (
    SELECT 1 FROM public.user_company_assignments
    WHERE user_id = auth.uid()
  )
);

CREATE POLICY "Users with permission can update receipts"
ON storage.objects FOR UPDATE
USING (
  bucket_id = 'receipts' AND
  EXISTS (
    SELECT 1 FROM public.user_company_assignments
    WHERE user_id = auth.uid()
  )
);

CREATE POLICY "Admins can delete receipts"
ON storage.objects FOR DELETE
USING (
  bucket_id = 'receipts' AND
  EXISTS (
    SELECT 1 FROM public.user_company_assignments
    WHERE user_id = auth.uid() AND role = 'admin'
  )
);