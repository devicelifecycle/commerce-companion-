

## Sitewide Audit — Completed

### Phase 1: Cleanup ✅
- Deleted 14 orphaned page files (Reports, Accounting, AccountingKnowledge, AccountsPayable/ReceivablePage, BalanceSheet, CashFlow, CostLedger, GoodsReceived, Guides, Help, ProfitLoss, Taxes, Team)
- Cleaned App.tsx imports (removed dead imports)
- Removed duplicate Marketplace tab from Dashboard
- Fixed Home.tsx: full company names, corrected Inventory Valuation link
- Renamed Dashboard title from "Reports" to "Dashboard"
- Removed dead `accountingLogs` variable from AuditLogs.tsx
- Renamed primary export to `ACCRUAL_CHART_OF_ACCOUNTS` (kept backward-compat alias)

### Phase 2: Data Integrity ✅
- Extended `run-data-validation` edge function with 5 new checks:
  - Unbalanced journal entries (debit ≠ credit)
  - Orphan journal entries (reference_id → deleted records)
  - AR records without linked journal entries
  - Expenses without journal entries
  - Unmapped chart of accounts codes
- Added foreign key constraints via migration for: expense_refunds, invoice_items, ap_payments, ar_payments

### Phase 3: Interactive Enhancements ✅
- Dashboard KPI tiles are now clickable — navigate to relevant pages (Financials, Inventory, Expenses, Orders)
- Chart of Accounts: clicking any account row opens a Sub-Ledger dialog showing its most recent 50 journal entry lines with dates, entry numbers, and debit/credit amounts

### Phase 4: AP/AR Integrity & Intercompany Automation ✅
- **Audit findings**: AP created on PO receive, import finalization, and intercompany transfers. AR created on sale accounting and invoice creation. All relationships present.
- **Manual transfers now trigger accounting**: `InventoryTransferDialog` now calls `process-intercompany-accounting` edge function instead of raw insert, creating dual-sided JEs, AR for seller, AP for buyer.
- **Cross-company auto-transfer**: `process-sale-accounting` already auto-detects when a device from company A is linked to a sale for company B and triggers intercompany transfer at cost with full AP/AR/JE entries.
- **PO → AP**: AP records are created when POs are received (not on PO creation — correct accrual accounting). Unpaid received POs have corresponding AP records with `category: 'inventory_purchase'`.
