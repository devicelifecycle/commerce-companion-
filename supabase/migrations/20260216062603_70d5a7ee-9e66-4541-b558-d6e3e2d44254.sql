
-- Step 1: Drop RLS policies that depend on get_user_role function
DROP POLICY IF EXISTS "Admins can manage company settings" ON public.company_settings;
DROP POLICY IF EXISTS "Admins can manage app settings" ON public.app_settings;

-- Step 2: Now drop get_user_role function
DROP FUNCTION IF EXISTS public.get_user_role(uuid, uuid);

-- Step 3: Update existing data
UPDATE public.user_company_assignments 
SET role = 'super_admin' WHERE role IN ('company_admin');

UPDATE public.user_company_assignments 
SET role = 'operations_staff' WHERE role IN ('accountant', 'sales_manager', 'view_only');

-- Step 4: Clean role_permissions
DELETE FROM public.role_permissions WHERE role NOT IN ('super_admin', 'operations_staff');

-- Step 5: Create new enum
CREATE TYPE public.user_role_v2 AS ENUM ('admin', 'associate');

-- Step 6: Alter columns
ALTER TABLE public.user_company_assignments ALTER COLUMN role DROP DEFAULT;
ALTER TABLE public.user_company_assignments 
  ALTER COLUMN role TYPE public.user_role_v2 
  USING (CASE WHEN role::text IN ('super_admin', 'company_admin') THEN 'admin'::public.user_role_v2 ELSE 'associate'::public.user_role_v2 END);
ALTER TABLE public.user_company_assignments ALTER COLUMN role SET DEFAULT 'associate'::public.user_role_v2;

ALTER TABLE public.role_permissions 
  ALTER COLUMN role TYPE public.user_role_v2 
  USING (CASE WHEN role::text IN ('super_admin', 'company_admin') THEN 'admin'::public.user_role_v2 ELSE 'associate'::public.user_role_v2 END);

-- Step 7: Drop old enum, rename new
DROP TYPE public.user_role;
ALTER TYPE public.user_role_v2 RENAME TO user_role;

-- Step 8: Recreate functions
CREATE OR REPLACE FUNCTION public.get_user_role(_user_id uuid, _company_id uuid)
 RETURNS user_role LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$ SELECT role FROM public.user_company_assignments WHERE user_id = _user_id AND company_id = _company_id LIMIT 1 $$;

CREATE OR REPLACE FUNCTION public.is_super_admin(_user_id uuid)
 RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$ SELECT EXISTS (SELECT 1 FROM public.user_company_assignments WHERE user_id = _user_id AND role = 'admin') $$;

CREATE OR REPLACE FUNCTION public.has_company_access(_user_id uuid, _company_id uuid)
 RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$ SELECT EXISTS (SELECT 1 FROM public.user_company_assignments WHERE user_id = _user_id AND (company_id = _company_id OR role = 'admin')) $$;

CREATE OR REPLACE FUNCTION public.has_permission(_user_id uuid, _company_id uuid, _permission_code text, _action text DEFAULT 'view'::text)
 RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
    SELECT EXISTS (
        SELECT 1 FROM public.user_company_assignments uca
        WHERE uca.user_id = _user_id 
        AND (uca.company_id = _company_id OR uca.role = 'admin')
        AND (uca.role = 'admin' OR EXISTS (
            SELECT 1 FROM public.role_permissions rp
            JOIN public.permissions p ON rp.permission_id = p.id
            WHERE rp.role = uca.role AND p.code = _permission_code
            AND ((_action = 'view' AND rp.can_view) OR (_action = 'create' AND rp.can_create) OR (_action = 'edit' AND rp.can_edit) OR (_action = 'delete' AND rp.can_delete))
        ))
    )
$$;

-- Step 9: Recreate RLS policies
CREATE POLICY "Admins can manage app settings" ON public.app_settings
  FOR ALL USING (is_super_admin(auth.uid()) OR get_user_role(auth.uid(), company_id) = 'admin'::user_role)
  WITH CHECK (is_super_admin(auth.uid()) OR get_user_role(auth.uid(), company_id) = 'admin'::user_role);

CREATE POLICY "Admins can manage company settings" ON public.company_settings
  FOR ALL USING (is_super_admin(auth.uid()) OR get_user_role(auth.uid(), company_id) = 'admin'::user_role)
  WITH CHECK (is_super_admin(auth.uid()) OR get_user_role(auth.uid(), company_id) = 'admin'::user_role);

-- Step 10: Set up role_permissions
DELETE FROM public.role_permissions;

INSERT INTO public.role_permissions (role, permission_id, can_view, can_create, can_edit, can_delete)
SELECT 'admin'::user_role, p.id, true, true, true, true FROM public.permissions p;

INSERT INTO public.role_permissions (role, permission_id, can_view, can_create, can_edit, can_delete)
SELECT 'associate'::user_role, p.id, 
  p.module IN ('overview', 'inventory', 'sales', 'expenses', 'invoices'),
  p.module IN ('inventory', 'sales', 'expenses', 'invoices'),
  p.module IN ('inventory', 'sales', 'expenses', 'invoices'),
  p.module IN ('inventory', 'sales')
FROM public.permissions p;
