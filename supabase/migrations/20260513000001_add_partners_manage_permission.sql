-- Seed partners_manage and partners_view permission codes.
-- role_permissions follow the same grant pattern as invoices_manage / inventory_manage.

INSERT INTO public.permissions (module, name, code, description)
VALUES
  ('Partners', 'Manage Partners', 'partners_manage', 'Create, edit, and settle partner consignment accounts'),
  ('Partners', 'View Partners',   'partners_view',   'View partner consignment devices, sales, and payables')
ON CONFLICT (code) DO NOTHING;

-- super_admin / company_admin: full access
INSERT INTO public.role_permissions (role, permission_id, can_view, can_create, can_edit, can_delete)
SELECT 'company_admin', id, true, true, true, true FROM public.permissions WHERE code = 'partners_manage'
ON CONFLICT (role, permission_id) DO NOTHING;

INSERT INTO public.role_permissions (role, permission_id, can_view, can_create, can_edit, can_delete)
SELECT 'company_admin', id, true, true, true, true FROM public.permissions WHERE code = 'partners_view'
ON CONFLICT (role, permission_id) DO NOTHING;

-- accountant: view + edit (settlements), no create/delete
INSERT INTO public.role_permissions (role, permission_id, can_view, can_create, can_edit, can_delete)
SELECT 'accountant', id, true, false, true, false FROM public.permissions WHERE code = 'partners_manage'
ON CONFLICT (role, permission_id) DO NOTHING;

INSERT INTO public.role_permissions (role, permission_id, can_view, can_create, can_edit, can_delete)
SELECT 'accountant', id, true, false, false, false FROM public.permissions WHERE code = 'partners_view'
ON CONFLICT (role, permission_id) DO NOTHING;

-- sales_manager: view only
INSERT INTO public.role_permissions (role, permission_id, can_view, can_create, can_edit, can_delete)
SELECT 'sales_manager', id, true, false, false, false FROM public.permissions WHERE code = 'partners_view'
ON CONFLICT (role, permission_id) DO NOTHING;

-- operations_staff: view only
INSERT INTO public.role_permissions (role, permission_id, can_view, can_create, can_edit, can_delete)
SELECT 'operations_staff', id, true, false, false, false FROM public.permissions WHERE code = 'partners_view'
ON CONFLICT (role, permission_id) DO NOTHING;
