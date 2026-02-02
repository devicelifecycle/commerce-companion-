-- Create companies table
CREATE TABLE public.companies (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    code text NOT NULL UNIQUE CHECK (code IN ('VES', 'TGW')),
    name text NOT NULL,
    description text,
    created_at timestamp with time zone NOT NULL DEFAULT now(),
    updated_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Insert the two companies
INSERT INTO public.companies (code, name, description) VALUES
    ('VES', 'VES Electronics', 'Amazon Canada marketplace seller'),
    ('TGW', 'TGW Electronics', 'BestBuy Canada and Shopify seller');

-- Create new extended role enum
CREATE TYPE public.user_role AS ENUM (
    'super_admin',
    'company_admin', 
    'accountant',
    'sales_manager',
    'operations_staff',
    'view_only'
);

-- Create user_company_assignments for multi-company access
CREATE TABLE public.user_company_assignments (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
    role user_role NOT NULL DEFAULT 'view_only',
    created_at timestamp with time zone NOT NULL DEFAULT now(),
    created_by uuid REFERENCES auth.users(id),
    UNIQUE(user_id, company_id)
);

-- Create permissions lookup table
CREATE TABLE public.permissions (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    code text NOT NULL UNIQUE,
    name text NOT NULL,
    description text,
    module text NOT NULL
);

-- Create role_permissions mapping
CREATE TABLE public.role_permissions (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    role user_role NOT NULL,
    permission_id uuid NOT NULL REFERENCES public.permissions(id) ON DELETE CASCADE,
    can_view boolean NOT NULL DEFAULT false,
    can_create boolean NOT NULL DEFAULT false,
    can_edit boolean NOT NULL DEFAULT false,
    can_delete boolean NOT NULL DEFAULT false,
    UNIQUE(role, permission_id)
);

-- Insert permissions
INSERT INTO public.permissions (code, name, description, module) VALUES
    ('dashboard', 'Dashboard', 'View dashboard and metrics', 'overview'),
    ('inventory_view', 'View Inventory', 'View inventory items', 'inventory'),
    ('inventory_manage', 'Manage Inventory', 'Add, edit, delete inventory', 'inventory'),
    ('sales_view', 'View Sales', 'View sales records', 'sales'),
    ('sales_manage', 'Manage Sales', 'Add, edit sales records', 'sales'),
    ('customers_view', 'View Customers', 'View customer records', 'customers'),
    ('customers_manage', 'Manage Customers', 'Add, edit customers', 'customers'),
    ('expenses_view', 'View Expenses', 'View expense records', 'finance'),
    ('expenses_manage', 'Manage Expenses', 'Add, edit expenses', 'finance'),
    ('invoices_view', 'View Invoices', 'View invoices', 'finance'),
    ('invoices_manage', 'Manage Invoices', 'Create, edit invoices', 'finance'),
    ('reports_view', 'View Reports', 'View financial reports', 'reports'),
    ('reports_export', 'Export Reports', 'Export reports to PDF/Excel', 'reports'),
    ('taxes_view', 'View Tax Records', 'View tax information', 'finance'),
    ('taxes_manage', 'Manage Tax Records', 'Add, edit tax records', 'finance'),
    ('accounting_view', 'View Accounting', 'View P&L, journal entries', 'accounting'),
    ('accounting_manage', 'Manage Accounting', 'Create journal entries', 'accounting'),
    ('users_view', 'View Users', 'View team members', 'admin'),
    ('users_manage', 'Manage Users', 'Add, edit, assign roles', 'admin'),
    ('settings_view', 'View Settings', 'View system settings', 'admin'),
    ('settings_manage', 'Manage Settings', 'Edit system settings', 'admin'),
    ('suppliers_view', 'View Suppliers', 'View supplier list', 'inventory'),
    ('suppliers_manage', 'Manage Suppliers', 'Add, edit suppliers', 'inventory'),
    ('import_data', 'Import Data', 'Bulk import inventory/sales', 'inventory'),
    ('forecasting', 'AI Forecasting', 'Access AI predictions', 'reports'),
    ('goals_view', 'View Goals', 'View profit goals', 'finance'),
    ('goals_manage', 'Manage Goals', 'Set profit goals', 'finance'),
    ('audit_logs', 'View Audit Logs', 'View system audit trail', 'admin'),
    ('intercompany', 'Intercompany Transactions', 'Manage VES-TGW transfers', 'accounting');

-- Insert role permissions matrix
-- Super Admin: Full access to everything
INSERT INTO public.role_permissions (role, permission_id, can_view, can_create, can_edit, can_delete)
SELECT 'super_admin', id, true, true, true, true FROM public.permissions;

-- Company Admin: Full access within company
INSERT INTO public.role_permissions (role, permission_id, can_view, can_create, can_edit, can_delete)
SELECT 'company_admin', id, true, true, true, true 
FROM public.permissions 
WHERE code NOT IN ('users_manage', 'settings_manage');

INSERT INTO public.role_permissions (role, permission_id, can_view, can_create, can_edit, can_delete)
SELECT 'company_admin', id, true, false, false, false 
FROM public.permissions 
WHERE code IN ('users_manage', 'settings_manage');

-- Accountant: Financial access, no inventory modification
INSERT INTO public.role_permissions (role, permission_id, can_view, can_create, can_edit, can_delete)
SELECT 'accountant', id, true, true, true, true 
FROM public.permissions 
WHERE module IN ('finance', 'accounting', 'reports') OR code = 'dashboard';

INSERT INTO public.role_permissions (role, permission_id, can_view, can_create, can_edit, can_delete)
SELECT 'accountant', id, true, false, false, false 
FROM public.permissions 
WHERE code IN ('inventory_view', 'sales_view', 'customers_view', 'suppliers_view');

-- Sales Manager: Sales and inventory access, limited financial
INSERT INTO public.role_permissions (role, permission_id, can_view, can_create, can_edit, can_delete)
SELECT 'sales_manager', id, true, true, true, true 
FROM public.permissions 
WHERE code IN ('dashboard', 'sales_view', 'sales_manage', 'customers_view', 'customers_manage', 'inventory_view');

INSERT INTO public.role_permissions (role, permission_id, can_view, can_create, can_edit, can_delete)
SELECT 'sales_manager', id, true, false, false, false 
FROM public.permissions 
WHERE code IN ('expenses_view', 'invoices_view', 'reports_view', 'goals_view', 'suppliers_view');

-- Operations Staff: Inventory and order fulfillment
INSERT INTO public.role_permissions (role, permission_id, can_view, can_create, can_edit, can_delete)
SELECT 'operations_staff', id, true, true, true, false 
FROM public.permissions 
WHERE code IN ('dashboard', 'inventory_view', 'inventory_manage', 'suppliers_view', 'suppliers_manage', 'import_data');

INSERT INTO public.role_permissions (role, permission_id, can_view, can_create, can_edit, can_delete)
SELECT 'operations_staff', id, true, false, false, false 
FROM public.permissions 
WHERE code IN ('sales_view', 'customers_view');

-- View Only: Dashboard and reports only
INSERT INTO public.role_permissions (role, permission_id, can_view, can_create, can_edit, can_delete)
SELECT 'view_only', id, true, false, false, false 
FROM public.permissions 
WHERE code IN ('dashboard', 'reports_view', 'inventory_view', 'sales_view', 'goals_view');

-- Add company_id to relevant tables
ALTER TABLE public.devices ADD COLUMN company_id uuid REFERENCES public.companies(id);
ALTER TABLE public.sales ADD COLUMN company_id uuid REFERENCES public.companies(id);
ALTER TABLE public.expenses ADD COLUMN company_id uuid REFERENCES public.companies(id);
ALTER TABLE public.invoices ADD COLUMN company_id uuid REFERENCES public.companies(id);
ALTER TABLE public.customers ADD COLUMN company_id uuid REFERENCES public.companies(id);
ALTER TABLE public.tax_records ADD COLUMN company_id uuid REFERENCES public.companies(id);
ALTER TABLE public.profit_goals ADD COLUMN company_id uuid REFERENCES public.companies(id);
ALTER TABLE public.suppliers ADD COLUMN company_id uuid REFERENCES public.companies(id);

-- Create audit_logs table
CREATE TABLE public.audit_logs (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid REFERENCES auth.users(id),
    company_id uuid REFERENCES public.companies(id),
    action text NOT NULL,
    table_name text NOT NULL,
    record_id uuid,
    old_data jsonb,
    new_data jsonb,
    ip_address text,
    user_agent text,
    created_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Update profiles table to include additional fields
ALTER TABLE public.profiles ADD COLUMN phone text;
ALTER TABLE public.profiles ADD COLUMN last_login_at timestamp with time zone;
ALTER TABLE public.profiles ADD COLUMN is_active boolean NOT NULL DEFAULT true;

-- Enable RLS on new tables
ALTER TABLE public.companies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_company_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.role_permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

-- Helper function to check if user is super admin
CREATE OR REPLACE FUNCTION public.is_super_admin(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT EXISTS (
        SELECT 1 FROM public.user_company_assignments
        WHERE user_id = _user_id AND role = 'super_admin'
    )
$$;

-- Helper function to check user role for a company
CREATE OR REPLACE FUNCTION public.get_user_role(_user_id uuid, _company_id uuid)
RETURNS user_role
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT role FROM public.user_company_assignments
    WHERE user_id = _user_id AND company_id = _company_id
    LIMIT 1
$$;

-- Helper function to check if user has access to a company
CREATE OR REPLACE FUNCTION public.has_company_access(_user_id uuid, _company_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT EXISTS (
        SELECT 1 FROM public.user_company_assignments
        WHERE user_id = _user_id 
        AND (company_id = _company_id OR role = 'super_admin')
    )
$$;

-- Helper function to check permission
CREATE OR REPLACE FUNCTION public.has_permission(_user_id uuid, _company_id uuid, _permission_code text, _action text DEFAULT 'view')
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT EXISTS (
        SELECT 1 
        FROM public.user_company_assignments uca
        JOIN public.role_permissions rp ON uca.role = rp.role
        JOIN public.permissions p ON rp.permission_id = p.id
        WHERE uca.user_id = _user_id 
        AND (uca.company_id = _company_id OR uca.role = 'super_admin')
        AND p.code = _permission_code
        AND (
            (_action = 'view' AND rp.can_view) OR
            (_action = 'create' AND rp.can_create) OR
            (_action = 'edit' AND rp.can_edit) OR
            (_action = 'delete' AND rp.can_delete)
        )
    )
$$;

-- RLS Policies for companies
CREATE POLICY "Authenticated users can view companies"
ON public.companies FOR SELECT
TO authenticated
USING (true);

-- RLS Policies for user_company_assignments
CREATE POLICY "Users can view their own assignments"
ON public.user_company_assignments FOR SELECT
TO authenticated
USING (user_id = auth.uid() OR is_super_admin(auth.uid()));

CREATE POLICY "Super admins can manage assignments"
ON public.user_company_assignments FOR ALL
TO authenticated
USING (is_super_admin(auth.uid()));

-- RLS Policies for permissions (read-only for all authenticated)
CREATE POLICY "Authenticated users can view permissions"
ON public.permissions FOR SELECT
TO authenticated
USING (true);

CREATE POLICY "Authenticated users can view role permissions"
ON public.role_permissions FOR SELECT
TO authenticated
USING (true);

-- RLS Policies for audit_logs
CREATE POLICY "Users can view audit logs for their companies"
ON public.audit_logs FOR SELECT
TO authenticated
USING (
    is_super_admin(auth.uid()) OR 
    has_company_access(auth.uid(), company_id)
);

CREATE POLICY "System can insert audit logs"
ON public.audit_logs FOR INSERT
TO authenticated
WITH CHECK (true);

-- Update RLS policies for existing tables to use company-based access
-- Devices
DROP POLICY IF EXISTS "Team members can view devices" ON public.devices;
DROP POLICY IF EXISTS "Admins and managers can insert devices" ON public.devices;
DROP POLICY IF EXISTS "Admins and managers can update devices" ON public.devices;
DROP POLICY IF EXISTS "Admins can delete devices" ON public.devices;

CREATE POLICY "Users can view devices for their companies"
ON public.devices FOR SELECT
TO authenticated
USING (
    is_super_admin(auth.uid()) OR 
    has_company_access(auth.uid(), company_id)
);

CREATE POLICY "Users with permission can insert devices"
ON public.devices FOR INSERT
TO authenticated
WITH CHECK (
    has_permission(auth.uid(), company_id, 'inventory_manage', 'create')
);

CREATE POLICY "Users with permission can update devices"
ON public.devices FOR UPDATE
TO authenticated
USING (
    has_permission(auth.uid(), company_id, 'inventory_manage', 'edit')
);

CREATE POLICY "Users with permission can delete devices"
ON public.devices FOR DELETE
TO authenticated
USING (
    has_permission(auth.uid(), company_id, 'inventory_manage', 'delete')
);

-- Sales
DROP POLICY IF EXISTS "Team members can view sales" ON public.sales;
DROP POLICY IF EXISTS "Admins and managers can manage sales" ON public.sales;

CREATE POLICY "Users can view sales for their companies"
ON public.sales FOR SELECT
TO authenticated
USING (
    is_super_admin(auth.uid()) OR 
    has_company_access(auth.uid(), company_id)
);

CREATE POLICY "Users with permission can manage sales"
ON public.sales FOR ALL
TO authenticated
USING (
    has_permission(auth.uid(), company_id, 'sales_manage', 'edit')
);

-- Expenses
DROP POLICY IF EXISTS "Team members can view expenses" ON public.expenses;
DROP POLICY IF EXISTS "Admins and managers can manage expenses" ON public.expenses;

CREATE POLICY "Users can view expenses for their companies"
ON public.expenses FOR SELECT
TO authenticated
USING (
    is_super_admin(auth.uid()) OR 
    has_company_access(auth.uid(), company_id)
);

CREATE POLICY "Users with permission can manage expenses"
ON public.expenses FOR ALL
TO authenticated
USING (
    has_permission(auth.uid(), company_id, 'expenses_manage', 'edit')
);

-- Customers
DROP POLICY IF EXISTS "Team members can view customers" ON public.customers;
DROP POLICY IF EXISTS "Admins and managers can manage customers" ON public.customers;

CREATE POLICY "Users can view customers for their companies"
ON public.customers FOR SELECT
TO authenticated
USING (
    is_super_admin(auth.uid()) OR 
    has_company_access(auth.uid(), company_id)
);

CREATE POLICY "Users with permission can manage customers"
ON public.customers FOR ALL
TO authenticated
USING (
    has_permission(auth.uid(), company_id, 'customers_manage', 'edit')
);

-- Invoices
DROP POLICY IF EXISTS "Team members can view invoices" ON public.invoices;
DROP POLICY IF EXISTS "Admins and managers can manage invoices" ON public.invoices;

CREATE POLICY "Users can view invoices for their companies"
ON public.invoices FOR SELECT
TO authenticated
USING (
    is_super_admin(auth.uid()) OR 
    has_company_access(auth.uid(), company_id)
);

CREATE POLICY "Users with permission can manage invoices"
ON public.invoices FOR ALL
TO authenticated
USING (
    has_permission(auth.uid(), company_id, 'invoices_manage', 'edit')
);

-- Tax Records
DROP POLICY IF EXISTS "Team members can view tax records" ON public.tax_records;
DROP POLICY IF EXISTS "Admins and managers can manage tax records" ON public.tax_records;

CREATE POLICY "Users can view tax records for their companies"
ON public.tax_records FOR SELECT
TO authenticated
USING (
    is_super_admin(auth.uid()) OR 
    has_company_access(auth.uid(), company_id)
);

CREATE POLICY "Users with permission can manage tax records"
ON public.tax_records FOR ALL
TO authenticated
USING (
    has_permission(auth.uid(), company_id, 'taxes_manage', 'edit')
);

-- Profit Goals
DROP POLICY IF EXISTS "Team members can view profit goals" ON public.profit_goals;
DROP POLICY IF EXISTS "Admins and managers can manage profit goals" ON public.profit_goals;

CREATE POLICY "Users can view profit goals for their companies"
ON public.profit_goals FOR SELECT
TO authenticated
USING (
    is_super_admin(auth.uid()) OR 
    has_company_access(auth.uid(), company_id)
);

CREATE POLICY "Users with permission can manage profit goals"
ON public.profit_goals FOR ALL
TO authenticated
USING (
    has_permission(auth.uid(), company_id, 'goals_manage', 'edit')
);

-- Suppliers
DROP POLICY IF EXISTS "Team members can view suppliers" ON public.suppliers;
DROP POLICY IF EXISTS "Admins and managers can manage suppliers" ON public.suppliers;

CREATE POLICY "Users can view suppliers for their companies"
ON public.suppliers FOR SELECT
TO authenticated
USING (
    is_super_admin(auth.uid()) OR 
    has_company_access(auth.uid(), company_id)
);

CREATE POLICY "Users with permission can manage suppliers"
ON public.suppliers FOR ALL
TO authenticated
USING (
    has_permission(auth.uid(), company_id, 'suppliers_manage', 'edit')
);

-- Create trigger for updating timestamps
CREATE TRIGGER update_companies_updated_at
BEFORE UPDATE ON public.companies
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Create index for performance
CREATE INDEX idx_user_company_assignments_user_id ON public.user_company_assignments(user_id);
CREATE INDEX idx_user_company_assignments_company_id ON public.user_company_assignments(company_id);
CREATE INDEX idx_audit_logs_user_id ON public.audit_logs(user_id);
CREATE INDEX idx_audit_logs_company_id ON public.audit_logs(company_id);
CREATE INDEX idx_audit_logs_created_at ON public.audit_logs(created_at DESC);
CREATE INDEX idx_devices_company_id ON public.devices(company_id);
CREATE INDEX idx_sales_company_id ON public.sales(company_id);
CREATE INDEX idx_expenses_company_id ON public.expenses(company_id);