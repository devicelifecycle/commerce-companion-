

## Sitewide Comprehensive Audit Report

### 1. Features & Information Duplication

**Critical duplications found:**

| Duplication | Location A | Location B | Recommendation |
|---|---|---|---|
| **Marketplace Reconciliation** | Financials → Reconciliation tab | Dashboard.tsx → "Marketplace" tab (uses same `MarketplaceAccounting` + `MarketplaceFeeAnalytics`) | Remove Reconciliation/Payouts/Marketplace tabs from Dashboard. Dashboard should be KPIs + charts only. Financials is the canonical location. |
| **MarketplaceAccounting component** | Used in Dashboard.tsx (line 561) | Used in Reports.tsx (line 84) — but Reports route redirects to /dashboard anyway | Reports.tsx is dead code (route `/reports` → `/dashboard`). Delete it entirely. |
| **PayoutReconciliation** | Financials.tsx | Reports.tsx (dead page) | Already dead — delete Reports.tsx |
| **Accounting Audit Trail** | AuditLogs.tsx still computes `accountingLogs` (line 228) and has accounting-related relationship views | Financials.tsx → Accounting Trail tab (`AccountingAuditTrail` component) | The `accountingLogs` variable in AuditLogs is computed but never rendered in a tab (it was removed). However, the Relationships tab in AuditLogs still shows JE/AP/AR data that overlaps with the Financials audit trail. Consider clarifying scope: AuditLogs = user actions only, Financials = ledger integrity. |
| **Executive Dashboard metrics** | Dashboard.tsx computes revenue, COGS, margins, AP, AR, inventory from scratch | ExecutiveDashboard.tsx (in Reports.tsx, dead) does the same | Delete Reports.tsx + ExecutiveDashboard.tsx or repurpose. |

**Orphaned / dead pages (imported nowhere or only via redirects):**
- `src/pages/Reports.tsx` — imported in App.tsx but `/reports` redirects to `/dashboard`; the component is never rendered
- `src/pages/Accounting.tsx` — not imported in App.tsx
- `src/pages/AccountingKnowledge.tsx` — not imported in App.tsx (content merged into HelpAndGuides)
- `src/pages/AccountsPayablePage.tsx` — not imported
- `src/pages/AccountsReceivablePage.tsx` — not imported
- `src/pages/BalanceSheet.tsx` — not imported (merged into Financials)
- `src/pages/CashFlow.tsx` — not imported (no Cash Flow view exists in Financials either — **gap**)
- `src/pages/CostLedger.tsx` — imported but route redirects to `/financials`
- `src/pages/GoodsReceived.tsx` — route redirects to `/purchase-orders`
- `src/pages/Guides.tsx` — not imported
- `src/pages/Help.tsx` — imported but never routed (HelpAndGuides used instead)
- `src/pages/ProfitLoss.tsx` — not imported
- `src/pages/Taxes.tsx` — route redirects to `/financials`
- `src/pages/Team.tsx` — imported but route redirects to `/settings`

**Recommendation:** Delete all 14 orphaned files. They add confusion and bundle size.

---

### 2. Outdated Information

| Location | Issue | Fix |
|---|---|---|
| **Home.tsx line 288** | "Cash Flow" report link points to `/financials` but there is **no Cash Flow view** in Financials. | Either add a Cash Flow Statement to Financials, or remove the link. |
| **Home.tsx line 290** | "Inventory Valuation" links to `/reports` which redirects to `/dashboard`. | Change to `/inventory` or `/dashboard`. |
| **Home.tsx line 29** | Shows `VES & TGW` abbreviations instead of full names. | Use full display names per project convention. |
| **HelpAndGuides.tsx line 19** | Imports `CASH_BASIS_CHART_OF_ACCOUNTS` — misleading name since system is accrual. | The export alias exists (`ACCRUAL_CHART_OF_ACCOUNTS`), use it for clarity. |
| **Dashboard.tsx line 308** | Title says "Reports" — this is the Dashboard/Reports page, but sidebar says "Reports" pointing to `/dashboard`. Naming is confusing. | Rename to "Dashboard" or "Reports & Dashboard" for consistency. |
| **AuditLogs.tsx line 228** | Still computes `accountingLogs` but doesn't render them (tab was removed). | Remove dead variable. |

---

### 3. Data Accountability & Gap Detection

**What's currently monitored (via `run-data-validation` edge function):**
- ✅ Missing tax on non-Amazon sales
- ✅ Unlinked inventory (`revenue_only` > 48h)
- ✅ Fee anomalies (outside expected ranges)
- ✅ Zero/negative sale prices
- ✅ Order number gaps (Shopify, BestBuy)
- ✅ Missing shipping province

**Gaps NOT currently detected:**
| Gap | Impact | Recommendation |
|---|---|---|
| **Unmapped chart of accounts** | If a `chart_of_accounts` row has no matching code in `chartOfAccounts.ts`, it's silently excluded from P&L/BS | Add validation: compare DB `chart_of_accounts` codes against known codes; flag unknowns |
| **Journal entries that don't balance** | `total_debit ≠ total_credit` | Add check in validation function |
| **Orphan journal entries** | JE with `reference_id` pointing to deleted sales/expenses | Add referential integrity check |
| **AP/AR without journal entries** | AP/AR records created manually without corresponding JE | Flag AP/AR with no linked JE |
| **Expenses without journal entries** | Expenses that were created but never had JE posted | Add check for expenses missing JE reference |
| **Cash Flow statement** | No Cash Flow Statement exists anywhere in the app | Add as a Financials sub-view |
| **Invoice AR tracking** | Invoices create AR, but no check that AR status matches invoice payment status | Add reconciliation check |

---

### 4. Missing Interactive Features

| Feature | Where | Description |
|---|---|---|
| **Clickable KPI drill-down** | Dashboard.tsx | KPI cards (Revenue, COGS, etc.) are static. Clicking should navigate to filtered views (e.g., click "AR Owed" → Financials AP/AR tab). |
| **Clickable chart segments** | Dashboard.tsx | Pie chart segments and bar chart bars should filter or navigate. |
| **Row actions on Audit Trail relationships** | AuditLogs.tsx | Sales in the Relationships tab show linked JE/AR counts but aren't clickable. Should open detail dialogs. |
| **Bulk actions on Journal Entries** | JournalEntries.tsx | No batch post/approve. Should support multi-select and batch status changes. |
| **AP/AR aging buckets clickable** | AccountsPayable/Receivable | Aging summary cards should filter the table when clicked. |
| **Cost Ledger device click-through** | CostLedgerPanel.tsx | Clicking a device in cost ledger should show its full lifecycle (purchase → storage → sale → JE). |
| **Chart of Accounts click-to-filter** | ChartOfAccounts.tsx | Clicking an account should show its journal entry history (sub-ledger view). |
| **Validation issue click-to-fix** | IntegrationHealth.tsx | Issues show descriptions but "Resolve" only marks as resolved. Should offer actionable fix (e.g., link to the sale to add missing device). |

---

### 5. Data Relationships & Population

**Relationships that are correct:**
- ✅ Sales → Devices (via `device_id`)
- ✅ Sales → Journal Entries (via `reference_id` on JE)
- ✅ Sales → AR (via `source_reference`)
- ✅ Expenses → Journal Entries (via `reference_id`)
- ✅ Import Batches → Devices (via `import_batch_id`)
- ✅ PO → GRN → GRN Items → Devices
- ✅ Invoices → Invoice Items → Devices
- ✅ Invoices → AR
- ✅ AP → AP Payments / AR → AR Payments

**Relationship issues found:**
| Issue | Detail |
|---|---|
| **`accounts_payable` has no FK to `vendors` table** | `vendor_id` column exists but no foreign key constraint in DB. Orphan risk. |
| **`expense_refunds.expense_id` has no FK** | No foreign key constraint visible. |
| **`grn_items` FKs not shown** | `grn_id`, `device_id`, `product_id`, `purchase_order_item_id` all lack explicit FKs. |
| **`invoice_items.invoice_id` no FK** | Same pattern — columns exist but no constraints enforced. |
| **`ap_payments.accounts_payable_id` no FK** | RLS references the join but no DB-level constraint. |

These missing FKs mean the database won't prevent orphaned records if a parent is deleted outside of the application.

---

### Implementation Plan

**Phase 1 — Cleanup (low risk)**
1. Delete 14 orphaned page files
2. Remove dead `Reports` import from App.tsx (keep redirect)
3. Remove dead `accountingLogs` computation from AuditLogs.tsx
4. Fix outdated links on Home.tsx
5. Rename Dashboard title from "Reports" to "Dashboard"

**Phase 2 — Data integrity**
6. Add Cash Flow Statement to Financials hub
7. Extend `run-data-validation` with 5 new checks (unbalanced JE, orphan JE, AP/AR without JE, expenses without JE, unmapped accounts)
8. Add foreign key constraints via migration for critical relationships

**Phase 3 — Interactive enhancements**
9. Add clickable KPI drill-downs on Dashboard
10. Add sub-ledger view (click account → see its JEs) in Chart of Accounts
11. Add actionable fix links on Integration Health validation issues

