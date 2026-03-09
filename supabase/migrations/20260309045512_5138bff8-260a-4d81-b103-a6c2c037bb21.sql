-- Fix overly-permissive RLS INSERT policies
-- These should only allow service_role or authorized users

-- 1. data_validation_issues: Only service role (edge functions) should insert
DROP POLICY IF EXISTS "Service role can insert validation issues" ON public.data_validation_issues;
CREATE POLICY "Service role can insert validation issues"
  ON public.data_validation_issues FOR INSERT
  TO service_role
  WITH CHECK (true);

-- 2. marketplace_payouts: Only service role (edge functions) should insert
DROP POLICY IF EXISTS "Service role can insert payouts" ON public.marketplace_payouts;
CREATE POLICY "Service role can insert payouts"
  ON public.marketplace_payouts FOR INSERT
  TO service_role
  WITH CHECK (true);

-- 3. notifications: Should only allow inserting notifications for yourself
DROP POLICY IF EXISTS "System can insert notifications" ON public.notifications;
CREATE POLICY "Users can insert own notifications"
  ON public.notifications FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

-- Also allow service_role to insert notifications for any user
CREATE POLICY "Service role can insert notifications"
  ON public.notifications FOR INSERT
  TO service_role
  WITH CHECK (true);

-- 4. sync_logs: Only service role (edge functions) should insert  
DROP POLICY IF EXISTS "Service role can insert sync logs" ON public.sync_logs;
CREATE POLICY "Service role can insert sync logs"
  ON public.sync_logs FOR INSERT
  TO service_role
  WITH CHECK (true);

-- ============================================
-- Performance indexes for high-traffic queries
-- ============================================

-- Sales: frequently filtered by company, marketplace, date, status
CREATE INDEX IF NOT EXISTS idx_sales_company_id ON public.sales(company_id);
CREATE INDEX IF NOT EXISTS idx_sales_marketplace ON public.sales(marketplace);
CREATE INDEX IF NOT EXISTS idx_sales_sale_date ON public.sales(sale_date DESC);
CREATE INDEX IF NOT EXISTS idx_sales_device_id ON public.sales(device_id);

-- Devices: filtered by company, status, brand
CREATE INDEX IF NOT EXISTS idx_devices_company_id ON public.devices(company_id);
CREATE INDEX IF NOT EXISTS idx_devices_status ON public.devices(status);
CREATE INDEX IF NOT EXISTS idx_devices_company_status ON public.devices(company_id, status);

-- Expenses: filtered by company, date, category
CREATE INDEX IF NOT EXISTS idx_expenses_company_id ON public.expenses(company_id);
CREATE INDEX IF NOT EXISTS idx_expenses_date ON public.expenses(expense_date DESC);
CREATE INDEX IF NOT EXISTS idx_expenses_category ON public.expenses(category);

-- Journal entries: filtered by company, reference, date
CREATE INDEX IF NOT EXISTS idx_journal_entries_company_id ON public.journal_entries(company_id);
CREATE INDEX IF NOT EXISTS idx_journal_entries_reference ON public.journal_entries(reference_type, reference_id);
CREATE INDEX IF NOT EXISTS idx_journal_entries_date ON public.journal_entries(entry_date DESC);

-- Journal entry lines: join-heavy
CREATE INDEX IF NOT EXISTS idx_journal_entry_lines_entry_id ON public.journal_entry_lines(journal_entry_id);
CREATE INDEX IF NOT EXISTS idx_journal_entry_lines_account_id ON public.journal_entry_lines(account_id);

-- Purchase orders
CREATE INDEX IF NOT EXISTS idx_purchase_orders_company_id ON public.purchase_orders(company_id);
CREATE INDEX IF NOT EXISTS idx_purchase_orders_status ON public.purchase_orders(status);

-- Invoices
CREATE INDEX IF NOT EXISTS idx_invoices_company_id ON public.invoices(company_id);
CREATE INDEX IF NOT EXISTS idx_invoices_status ON public.invoices(status);

-- Accounts payable/receivable
CREATE INDEX IF NOT EXISTS idx_ap_company_id ON public.accounts_payable(company_id);
CREATE INDEX IF NOT EXISTS idx_ap_status ON public.accounts_payable(status);
CREATE INDEX IF NOT EXISTS idx_ar_company_id ON public.accounts_receivable(company_id);
CREATE INDEX IF NOT EXISTS idx_ar_status ON public.accounts_receivable(status);

-- Audit logs: queried by company, date, table
CREATE INDEX IF NOT EXISTS idx_audit_logs_company_id ON public.audit_logs(company_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON public.audit_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_table_name ON public.audit_logs(table_name);

-- User company assignments: critical for RLS function performance
CREATE INDEX IF NOT EXISTS idx_uca_user_id ON public.user_company_assignments(user_id);
CREATE INDEX IF NOT EXISTS idx_uca_company_id ON public.user_company_assignments(company_id);
CREATE INDEX IF NOT EXISTS idx_uca_user_company ON public.user_company_assignments(user_id, company_id);

-- Chart of accounts
CREATE INDEX IF NOT EXISTS idx_coa_company_id ON public.chart_of_accounts(company_id);

-- GRN items
CREATE INDEX IF NOT EXISTS idx_grn_items_device_id ON public.grn_items(device_id);
CREATE INDEX IF NOT EXISTS idx_grn_items_grn_id ON public.grn_items(grn_id);

-- PO items
CREATE INDEX IF NOT EXISTS idx_po_items_device_id ON public.purchase_order_items(device_id);
CREATE INDEX IF NOT EXISTS idx_po_items_po_id ON public.purchase_order_items(purchase_order_id);