-- Lock down SECURITY DEFINER helper functions so they can't be called directly
-- via the PostgREST API by anon or authenticated roles. They remain usable
-- inside RLS policies and triggers because those run with elevated rights.

REVOKE EXECUTE ON FUNCTION public.has_role(uuid, app_role) FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.has_company_access(uuid, uuid) FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.is_super_admin(uuid) FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.get_user_role(uuid, uuid) FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.has_permission(uuid, uuid, text, text) FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.is_team_member(uuid) FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.create_notification(uuid, uuid, text, text, text, text, text) FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM anon, authenticated, public;