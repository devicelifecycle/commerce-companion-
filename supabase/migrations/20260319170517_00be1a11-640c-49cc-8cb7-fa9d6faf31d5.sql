
DO $$ BEGIN
  -- expense_refunds.expense_id → expenses
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'expense_refunds_expense_id_fkey') THEN
    ALTER TABLE public.expense_refunds ADD CONSTRAINT expense_refunds_expense_id_fkey FOREIGN KEY (expense_id) REFERENCES public.expenses(id) ON DELETE CASCADE;
  END IF;

  -- expense_refunds.company_id → companies
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'expense_refunds_company_id_fkey') THEN
    ALTER TABLE public.expense_refunds ADD CONSTRAINT expense_refunds_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE SET NULL;
  END IF;

  -- invoice_items.invoice_id → invoices
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'invoice_items_invoice_id_fkey') THEN
    ALTER TABLE public.invoice_items ADD CONSTRAINT invoice_items_invoice_id_fkey FOREIGN KEY (invoice_id) REFERENCES public.invoices(id) ON DELETE CASCADE;
  END IF;

  -- invoice_items.device_id → devices
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'invoice_items_device_id_fkey') THEN
    ALTER TABLE public.invoice_items ADD CONSTRAINT invoice_items_device_id_fkey FOREIGN KEY (device_id) REFERENCES public.devices(id) ON DELETE SET NULL;
  END IF;

  -- ap_payments.accounts_payable_id → accounts_payable
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ap_payments_accounts_payable_id_fkey') THEN
    ALTER TABLE public.ap_payments ADD CONSTRAINT ap_payments_accounts_payable_id_fkey FOREIGN KEY (accounts_payable_id) REFERENCES public.accounts_payable(id) ON DELETE CASCADE;
  END IF;

  -- ar_payments.accounts_receivable_id → accounts_receivable
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ar_payments_accounts_receivable_id_fkey') THEN
    ALTER TABLE public.ar_payments ADD CONSTRAINT ar_payments_accounts_receivable_id_fkey FOREIGN KEY (accounts_receivable_id) REFERENCES public.accounts_receivable(id) ON DELETE CASCADE;
  END IF;
END $$;
