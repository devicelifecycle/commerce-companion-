-- Drop and cleanly recreate all policies on user_company_assignments.
-- The previous policies used is_super_admin() which works but creates
-- an indirect dependency. Replace with simpler direct auth.uid() checks.

DROP POLICY IF EXISTS "Users can view their own assignments" ON public.user_company_assignments;
DROP POLICY IF EXISTS "Super admins can manage assignments" ON public.user_company_assignments;
DROP POLICY IF EXISTS "Admins can manage assignments" ON public.user_company_assignments;
DROP POLICY IF EXISTS "Users can view own assignments" ON public.user_company_assignments;
DROP POLICY IF EXISTS "Admins can manage all assignments" ON public.user_company_assignments;

-- Any authenticated user can read rows where user_id matches their own auth.uid().
-- SECURITY DEFINER on is_super_admin breaks the recursion for admin-wide reads.
CREATE POLICY "user_company_assignments_select"
ON public.user_company_assignments
FOR SELECT
TO authenticated
USING (user_id = auth.uid() OR is_super_admin(auth.uid()));

-- Only admins can insert/update/delete assignments.
CREATE POLICY "user_company_assignments_modify"
ON public.user_company_assignments
FOR ALL
TO authenticated
USING (is_super_admin(auth.uid()))
WITH CHECK (is_super_admin(auth.uid()));
