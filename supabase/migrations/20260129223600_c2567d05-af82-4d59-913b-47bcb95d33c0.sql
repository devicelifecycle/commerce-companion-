-- Create customers table for CRM
CREATE TABLE public.customers (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    name TEXT NOT NULL,
    email TEXT,
    phone TEXT,
    address TEXT,
    notes TEXT,
    total_purchases NUMERIC DEFAULT 0,
    total_spent NUMERIC DEFAULT 0,
    created_by UUID,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create profit goals table
CREATE TABLE public.profit_goals (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    month DATE NOT NULL,
    revenue_goal NUMERIC NOT NULL DEFAULT 0,
    profit_goal NUMERIC NOT NULL DEFAULT 0,
    expense_limit NUMERIC,
    notes TEXT,
    created_by UUID,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    UNIQUE(month)
);

-- Enable RLS
ALTER TABLE public.customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profit_goals ENABLE ROW LEVEL SECURITY;

-- RLS policies for customers
CREATE POLICY "Team members can view customers"
ON public.customers FOR SELECT
USING (is_team_member(auth.uid()));

CREATE POLICY "Admins and managers can manage customers"
ON public.customers FOR ALL
USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'manager'::app_role));

-- RLS policies for profit_goals
CREATE POLICY "Team members can view profit goals"
ON public.profit_goals FOR SELECT
USING (is_team_member(auth.uid()));

CREATE POLICY "Admins and managers can manage profit goals"
ON public.profit_goals FOR ALL
USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'manager'::app_role));

-- Add customer_id to sales table for linking
ALTER TABLE public.sales ADD COLUMN customer_id UUID REFERENCES public.customers(id);

-- Create updated_at triggers
CREATE TRIGGER update_customers_updated_at
    BEFORE UPDATE ON public.customers
    FOR EACH ROW
    EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_profit_goals_updated_at
    BEFORE UPDATE ON public.profit_goals
    FOR EACH ROW
    EXECUTE FUNCTION public.update_updated_at_column();

-- Create storage bucket for receipts/documents
INSERT INTO storage.buckets (id, name, public)
VALUES ('receipts', 'receipts', false)
ON CONFLICT (id) DO NOTHING;

-- Storage policies for receipts bucket
CREATE POLICY "Team members can view receipts"
ON storage.objects FOR SELECT
USING (bucket_id = 'receipts' AND is_team_member(auth.uid()));

CREATE POLICY "Admins and managers can upload receipts"
ON storage.objects FOR INSERT
WITH CHECK (bucket_id = 'receipts' AND (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'manager'::app_role)));

CREATE POLICY "Admins and managers can update receipts"
ON storage.objects FOR UPDATE
USING (bucket_id = 'receipts' AND (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'manager'::app_role)));

CREATE POLICY "Admins can delete receipts"
ON storage.objects FOR DELETE
USING (bucket_id = 'receipts' AND has_role(auth.uid(), 'admin'::app_role));