
INSERT INTO public.chart_of_accounts (company_id, account_code, account_name, account_type, normal_balance, is_active, is_system_account)
SELECT c.id, v.code, v.name, v.type, v.normal, true, false
FROM public.companies c
CROSS JOIN (VALUES
  ('4500', 'Refurbishment Service Revenue', 'revenue', 'credit'),
  ('4510', 'Consignment Commission Revenue', 'revenue', 'credit'),
  ('2050', 'Partner Payable', 'liability', 'credit'),
  ('1052', 'Partner Receivable', 'asset', 'debit')
) AS v(code, name, type, normal)
WHERE NOT EXISTS (
  SELECT 1 FROM public.chart_of_accounts coa
  WHERE coa.company_id = c.id AND coa.account_code = v.code
);
