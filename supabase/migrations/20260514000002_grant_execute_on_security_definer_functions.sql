-- ROOT CAUSE FIX: EXECUTE grants missing on all SECURITY DEFINER helper functions.
--
-- Every RLS policy that calls is_super_admin(), get_user_role(), has_company_access(),
-- or has_permission() was failing with "permission denied for function" because
-- PostgreSQL requires explicit EXECUTE grants even on SECURITY DEFINER functions.
-- The authenticated role was never granted EXECUTE, so every query that hit one of
-- these policies returned a hard error (not just an empty result), blocking all
-- data access for every logged-in user.

-- Grant EXECUTE on all security-definer helper functions used in RLS policies.
GRANT EXECUTE ON FUNCTION public.is_super_admin(uuid)                              TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.get_user_role(uuid, uuid)                         TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.has_company_access(uuid, uuid)                    TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.has_permission(uuid, uuid, text, text)            TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, app_role)                          TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.is_team_member(uuid)                              TO authenticated, anon;

-- Also fix the user_company_assignments SELECT policy to use a direct auth.uid()
-- check for own-row reads (no function call needed, avoids any future permission
-- issues on the critical path that loads company/role state on every page load).
DROP POLICY IF EXISTS "user_company_assignments_select" ON public.user_company_assignments;
DROP POLICY IF EXISTS "Users can view their own assignments" ON public.user_company_assignments;

CREATE POLICY "user_company_assignments_select"
ON public.user_company_assignments
FOR SELECT
TO authenticated
USING (
  -- Users always see their own rows (no function call — no permission risk).
  user_id = auth.uid()
  OR
  -- Admins see all rows (SECURITY DEFINER, now properly granted EXECUTE above).
  is_super_admin(auth.uid())
);
