
-- 1. Add company_id column to vendors table
ALTER TABLE public.vendors ADD COLUMN company_id uuid REFERENCES public.companies(id);

-- 2. Assign existing vendors to first company (safe default)
UPDATE public.vendors SET company_id = (SELECT id FROM public.companies LIMIT 1) WHERE company_id IS NULL;

-- 3. Drop old overly permissive policies
DROP POLICY IF EXISTS "Authenticated users can view vendors" ON public.vendors;
DROP POLICY IF EXISTS "Authenticated users can manage vendors" ON public.vendors;

-- 4. Create proper company-scoped RLS policies
CREATE POLICY "Users can view vendors for their companies"
  ON public.vendors FOR SELECT
  USING (is_super_admin(auth.uid()) OR has_company_access(auth.uid(), company_id));

CREATE POLICY "Users with permission can manage vendors"
  ON public.vendors FOR ALL
  USING (has_permission(auth.uid(), company_id, 'suppliers_manage', 'edit'));
