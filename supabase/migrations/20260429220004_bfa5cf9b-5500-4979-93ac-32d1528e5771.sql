DROP INDEX IF EXISTS public.idx_ap_company;
DROP INDEX IF EXISTS public.idx_ar_company;
DROP INDEX IF EXISTS public.idx_je_company;
DROP INDEX IF EXISTS public.idx_je_date;
DROP INDEX IF EXISTS public.idx_jel_entry;
DROP INDEX IF EXISTS public.idx_purchase_orders_company;
DROP INDEX IF EXISTS public.devices_imei_idx;

CREATE INDEX IF NOT EXISTS idx_sales_company_sale_date
  ON public.sales (company_id, sale_date DESC);

CREATE INDEX IF NOT EXISTS idx_journal_entries_company_date
  ON public.journal_entries (company_id, entry_date DESC);

CREATE INDEX IF NOT EXISTS idx_jel_account_entry
  ON public.journal_entry_lines (account_id, journal_entry_id);

CREATE INDEX IF NOT EXISTS idx_expenses_company_date
  ON public.expenses (company_id, expense_date DESC);

CREATE INDEX IF NOT EXISTS idx_devices_company_status_date
  ON public.devices (company_id, status, created_at DESC);
