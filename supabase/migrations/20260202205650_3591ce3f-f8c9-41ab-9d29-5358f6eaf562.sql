-- Add new fields to expenses table
ALTER TABLE public.expenses
ADD COLUMN IF NOT EXISTS subcategory text,
ADD COLUMN IF NOT EXISTS gst_hst_amount numeric DEFAULT 0,
ADD COLUMN IF NOT EXISTS pst_amount numeric DEFAULT 0,
ADD COLUMN IF NOT EXISTS total_amount numeric GENERATED ALWAYS AS (amount + COALESCE(gst_hst_amount, 0) + COALESCE(pst_amount, 0)) STORED,
ADD COLUMN IF NOT EXISTS payment_method text DEFAULT 'credit_card',
ADD COLUMN IF NOT EXISTS is_shared boolean DEFAULT false,
ADD COLUMN IF NOT EXISTS allocation_ves numeric DEFAULT 100,
ADD COLUMN IF NOT EXISTS allocation_tgw numeric DEFAULT 0,
ADD COLUMN IF NOT EXISTS is_recurring boolean DEFAULT false,
ADD COLUMN IF NOT EXISTS recurring_frequency text,
ADD COLUMN IF NOT EXISTS recurring_end_date date,
ADD COLUMN IF NOT EXISTS parent_expense_id uuid REFERENCES public.expenses(id),
ADD COLUMN IF NOT EXISTS approval_status text DEFAULT 'approved',
ADD COLUMN IF NOT EXISTS approved_by uuid;

-- Create expense_subcategories table for better organization
CREATE TABLE IF NOT EXISTS public.expense_subcategories (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  category text NOT NULL,
  subcategory text NOT NULL,
  description text,
  UNIQUE(category, subcategory)
);

-- Insert default subcategories
INSERT INTO public.expense_subcategories (category, subcategory, description) VALUES
-- COGS
('inventory', 'product_purchase', 'Device and product purchases'),
('shipping', 'inbound_shipping', 'Shipping costs for inventory'),
('shipping', 'shipping_supplies', 'Boxes, tape, packing materials'),
-- Operating Expenses
('utilities', 'rent', 'Office/warehouse rent'),
('utilities', 'electricity', 'Electricity bills'),
('utilities', 'internet', 'Internet and telecommunications'),
('office', 'supplies', 'Office supplies'),
('office', 'furniture', 'Office furniture'),
('software', 'subscriptions', 'Software subscriptions'),
('software', 'licenses', 'Software licenses'),
('professional_services', 'accounting', 'Accounting services'),
('professional_services', 'legal', 'Legal services'),
('professional_services', 'consulting', 'Consulting fees'),
('equipment', 'purchase', 'Equipment purchases'),
('equipment', 'maintenance', 'Equipment maintenance'),
('marketing', 'advertising', 'Advertising costs'),
('marketing', 'promotions', 'Promotional materials'),
('travel', 'transportation', 'Transportation costs'),
('travel', 'accommodation', 'Hotel and lodging'),
('travel', 'meals', 'Business meals'),
-- Marketplace Fees
('other', 'amazon_fees', 'Amazon referral and FBA fees'),
('other', 'bestbuy_commission', 'BestBuy marketplace commission'),
('other', 'shopify_fees', 'Shopify subscription and transaction fees'),
('other', 'payment_processing', 'Payment processing fees'),
('other', 'bank_fees', 'Bank fees and charges'),
('other', 'insurance', 'Business insurance')
ON CONFLICT DO NOTHING;

-- Create allocation_rules table for default shared expense splits
CREATE TABLE IF NOT EXISTS public.expense_allocation_rules (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  category text NOT NULL,
  subcategory text,
  default_ves_percentage numeric NOT NULL DEFAULT 50,
  default_tgw_percentage numeric NOT NULL DEFAULT 50,
  description text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE(category, subcategory)
);

-- Insert default allocation rules
INSERT INTO public.expense_allocation_rules (category, subcategory, default_ves_percentage, default_tgw_percentage, description) VALUES
('utilities', 'rent', 50, 50, 'Shared rent allocation'),
('utilities', 'electricity', 50, 50, 'Shared utilities'),
('utilities', 'internet', 50, 50, 'Shared internet'),
('office', 'supplies', 50, 50, 'Shared office supplies'),
('software', 'subscriptions', 50, 50, 'Shared software subscriptions')
ON CONFLICT DO NOTHING;

-- Create vendors table for vendor management
CREATE TABLE IF NOT EXISTS public.vendors (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name text NOT NULL UNIQUE,
  contact_name text,
  email text,
  phone text,
  address text,
  category text,
  notes text,
  total_spent numeric DEFAULT 0,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.expense_subcategories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.expense_allocation_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vendors ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Everyone can view subcategories" ON public.expense_subcategories FOR SELECT USING (true);
CREATE POLICY "Everyone can view allocation rules" ON public.expense_allocation_rules FOR SELECT USING (true);
CREATE POLICY "Admins can manage allocation rules" ON public.expense_allocation_rules FOR ALL USING (is_super_admin(auth.uid()));

CREATE POLICY "Authenticated users can view vendors" ON public.vendors FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can manage vendors" ON public.vendors FOR ALL TO authenticated USING (true);

-- Create index for recurring expenses
CREATE INDEX IF NOT EXISTS expenses_recurring_idx ON public.expenses(is_recurring, recurring_frequency) WHERE is_recurring = true;
CREATE INDEX IF NOT EXISTS expenses_parent_idx ON public.expenses(parent_expense_id) WHERE parent_expense_id IS NOT NULL;