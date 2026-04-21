
-- Add fields capturing actual Shopify (and other marketplace) financial data
ALTER TABLE public.sales
  ADD COLUMN IF NOT EXISTS shipping_revenue numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS payout_amount numeric,
  ADD COLUMN IF NOT EXISTS tax_rate numeric,
  ADD COLUMN IF NOT EXISTS tax_title text;

COMMENT ON COLUMN public.sales.shipping_revenue IS 'Shipping charge collected from customer (income). Different from shipping_cost which is what we paid to ship.';
COMMENT ON COLUMN public.sales.payout_amount IS 'Net amount actually paid out by marketplace after fees (sale_price - fees).';
COMMENT ON COLUMN public.sales.tax_rate IS 'Effective tax rate from marketplace (e.g. 0.05 for 5% GST).';
COMMENT ON COLUMN public.sales.tax_title IS 'Tax label from marketplace (e.g. GST, HST, GST+PST).';

-- Add Shopify Shipping Revenue account to TGW chart of accounts
INSERT INTO public.chart_of_accounts (company_id, account_code, account_name, account_type, account_subtype, normal_balance, is_system_account, is_active)
SELECT c.id, '4102', 'Shipping Revenue - Shopify - TGW', 'revenue', 'operating_revenue', 'credit', true, true
FROM public.companies c
WHERE c.code = 'TGW'
  AND NOT EXISTS (
    SELECT 1 FROM public.chart_of_accounts coa
    WHERE coa.company_id = c.id AND coa.account_code = '4102'
  );

-- Best Buy & Amazon shipping revenue (shipping is rare for these but be consistent)
INSERT INTO public.chart_of_accounts (company_id, account_code, account_name, account_type, account_subtype, normal_balance, is_system_account, is_active)
SELECT c.id, '4002', 'Shipping Revenue - Amazon - VES', 'revenue', 'operating_revenue', 'credit', true, true
FROM public.companies c
WHERE c.code = 'VES'
  AND NOT EXISTS (SELECT 1 FROM public.chart_of_accounts coa WHERE coa.company_id = c.id AND coa.account_code = '4002');

INSERT INTO public.chart_of_accounts (company_id, account_code, account_name, account_type, account_subtype, normal_balance, is_system_account, is_active)
SELECT c.id, '4103', 'Shipping Revenue - BestBuy - TGW', 'revenue', 'operating_revenue', 'credit', true, true
FROM public.companies c
WHERE c.code = 'TGW'
  AND NOT EXISTS (SELECT 1 FROM public.chart_of_accounts coa WHERE coa.company_id = c.id AND coa.account_code = '4103');
