-- Seed partners_manage and partners_view permission codes.
-- user_role enum (as of migration 20260216062603) is: 'admin' | 'associate'
-- admin gets full access to everything; associates get view-only on Partners.

INSERT INTO public.permissions (module, name, code, description)
VALUES
  ('partners', 'Manage Partners', 'partners_manage', 'Create, edit, and settle partner consignment accounts'),
  ('partners', 'View Partners',   'partners_view',   'View partner consignment devices, sales, and payables')
ON CONFLICT (code) DO NOTHING;

-- admin: full access
INSERT INTO public.role_permissions (role, permission_id, can_view, can_create, can_edit, can_delete)
SELECT 'admin'::user_role, id, true, true, true, true
FROM public.permissions WHERE code IN ('partners_manage', 'partners_view')
ON CONFLICT DO NOTHING;

-- associate: view-only on partners_view
INSERT INTO public.role_permissions (role, permission_id, can_view, can_create, can_edit, can_delete)
SELECT 'associate'::user_role, id, true, false, false, false
FROM public.permissions WHERE code = 'partners_view'
ON CONFLICT DO NOTHING;
