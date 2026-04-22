-- ============================================================
-- STAGE 1: Restore device inventory
-- ============================================================
UPDATE public.devices
SET status = 'in_stock',
    sale_price = NULL,
    updated_at = now()
WHERE status = 'sold';

-- ============================================================
-- STAGE 2: Delete journal entries tied to sales/returns/payouts
-- ============================================================
DELETE FROM public.journal_entry_lines
WHERE journal_entry_id IN (
  SELECT id FROM public.journal_entries
  WHERE reference_type IN ('sale', 'return', 'sales', 'returns', 'marketplace_payout', 'payout')
);

DELETE FROM public.journal_entries
WHERE reference_type IN ('sale', 'return', 'sales', 'returns', 'marketplace_payout', 'payout');

-- ============================================================
-- STAGE 3: Delete AR tied to sales / marketplace payouts
-- ============================================================
DELETE FROM public.ar_payments
WHERE accounts_receivable_id IN (
  SELECT id FROM public.accounts_receivable
  WHERE source_type IN ('sale', 'sales', 'marketplace_payout', 'payout')
     OR payout_id IS NOT NULL
);

DELETE FROM public.accounts_receivable
WHERE source_type IN ('sale', 'sales', 'marketplace_payout', 'payout')
   OR payout_id IS NOT NULL;

-- ============================================================
-- STAGE 4: Delete returns and return authorizations
-- ============================================================
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='return_items') THEN
    EXECUTE 'DELETE FROM public.return_items';
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='returns') THEN
    EXECUTE 'DELETE FROM public.returns';
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='return_authorization_items') THEN
    EXECUTE 'DELETE FROM public.return_authorization_items';
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='return_authorizations') THEN
    EXECUTE 'DELETE FROM public.return_authorizations';
  END IF;
END $$;

-- ============================================================
-- STAGE 5: Delete sales tax details and sale items, then sales
-- ============================================================
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='sales_tax_details') THEN
    EXECUTE 'DELETE FROM public.sales_tax_details';
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='sale_items') THEN
    EXECUTE 'DELETE FROM public.sale_items';
  END IF;
END $$;

DELETE FROM public.sales;

-- ============================================================
-- STAGE 6: Delete marketplace payouts and reconciliations
-- ============================================================
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='payout_reconciliations') THEN
    EXECUTE 'DELETE FROM public.payout_reconciliations';
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='payout_line_items') THEN
    EXECUTE 'DELETE FROM public.payout_line_items';
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='marketplace_payouts') THEN
    EXECUTE 'DELETE FROM public.marketplace_payouts';
  END IF;
END $$;

-- ============================================================
-- STAGE 7: Recompute current_balance for affected GL accounts
-- ============================================================
UPDATE public.chart_of_accounts coa
SET current_balance = COALESCE(coa.opening_balance, 0) + COALESCE(activity.net, 0),
    updated_at = now()
FROM (
  SELECT 
    jel.account_id,
    SUM(
      CASE 
        WHEN coa_inner.normal_balance = 'debit' THEN COALESCE(jel.debit_amount, 0) - COALESCE(jel.credit_amount, 0)
        ELSE COALESCE(jel.credit_amount, 0) - COALESCE(jel.debit_amount, 0)
      END
    ) AS net
  FROM public.journal_entry_lines jel
  JOIN public.journal_entries je ON je.id = jel.journal_entry_id
  JOIN public.chart_of_accounts coa_inner ON coa_inner.id = jel.account_id
  WHERE je.status = 'posted'
  GROUP BY jel.account_id
) activity
WHERE coa.id = activity.account_id;

UPDATE public.chart_of_accounts
SET current_balance = COALESCE(opening_balance, 0),
    updated_at = now()
WHERE id NOT IN (
  SELECT DISTINCT jel.account_id
  FROM public.journal_entry_lines jel
  JOIN public.journal_entries je ON je.id = jel.journal_entry_id
  WHERE je.status = 'posted'
);