

## Financials Section Overhaul

### Issues Identified

1. **Gross Profit / Net Profit banners unreadable** — Lines 400 and 466 in `ProfitLossReport.tsx` use `bg-blue-50 dark:bg-blue-950/30` and `bg-emerald-50 dark:bg-emerald-950/30` with no explicit text color. In the dark theme, the text inherits `foreground` but the low-contrast tinted background makes it invisible until highlighted. Same issue exists in the Balance Sheet balanced/unbalanced banner (line 315-325).

2. **Invoice revenue not separated** — `CreateInvoiceDialog.tsx` posts invoice revenue to `4000` (Amazon/VES) or `4100` (BestBuy/TGW). Invoices are direct sales, not marketplace sales. They should post to dedicated "Invoice/Direct Sales Revenue" accounts (`4400`/`4401`). The P&L report must also display this line. The Balance Sheet is also missing AR (accounts `1050`/`1051`) from its assets section — a significant omission.

3. **"Cash Basis" badge on P&L** — Line 355 shows `<Badge>Cash Basis</Badge>`. The system uses accrual accounting. Must change to "Accrual Basis".

4. **Company filter not prominent** — The VES/TGW/All toggle is a tiny `text-xs` ToggleGroup tucked in the top-right corner. Needs to be larger, more visible, and use full company names.

### Plan

#### A. Fix P&L Banner Readability (`ProfitLossReport.tsx`)
- Replace `bg-blue-50 dark:bg-blue-950/30` on Gross Profit banner with `bg-primary/10 border border-primary/30` and add explicit `text-foreground` on the text.
- Replace `bg-emerald-50 dark:bg-emerald-950/30` / `bg-red-50 dark:bg-red-950/30` on Net Profit banner similarly with high-contrast border-based styling.
- Fix the tax note at the bottom (line 499): remove "Marketplace remits tax to CRA" — seller remits.

#### B. Fix Balance Sheet Banner Readability (`BalanceSheetReport.tsx`)
- Same pattern: replace `dark:bg-emerald-950/30` and `dark:bg-red-950/30` with bordered, high-contrast variants.
- Add **Accounts Receivable** (`1050`/`1051`) to the assets section — currently missing entirely.
- Add **Accounts Payable** (`2010`/`2011`) to the liabilities section — currently missing.

#### C. Add Invoice/Direct Sales Revenue Accounts
- Add accounts `4400` (Direct Sales Revenue - VES) and `4401` (Direct Sales Revenue - TGW) to `chartOfAccounts.ts`.
- Update `CreateInvoiceDialog.tsx` to post to `4400`/`4401` instead of reusing marketplace accounts.
- Update `Invoices.tsx` sale-adjustment journal entries to use `4400`/`4401`.
- Update `ProfitLossReport.tsx` to:
  - Add `invoiceSales` field to `PLData.revenue`
  - Map account codes `4400`/`4401` to this field
  - Display "Direct / Invoice Sales" as a revenue line
  - Include it in total revenue calculation

#### D. Change "Cash Basis" to "Accrual Basis" (`ProfitLossReport.tsx`)
- Line 355: change `Cash Basis` to `Accrual Basis`.

#### E. Make Company Filter Prominent (`Financials.tsx`)
- Move the company selector from the header corner to a dedicated row below the title.
- Increase size: use `text-sm` instead of `text-xs`, larger padding.
- Display full company names via `getCompanyDisplayName()` (e.g., "Virtual eShop" instead of "VES").
- Add a visual indicator (colored left border or background tint) when a specific company is selected.
- Pass `companyView` to `ProfitLossReport` and `BalanceSheetReport` so they respect the Financials-level filter instead of only using `selectedCompany` from context.

#### F. Catch-all Account Coverage in P&L
- Add a catch-all for any revenue account code starting with `4` that isn't explicitly mapped — display as "Other Revenue".
- Add a catch-all for any expense account code starting with `6` or `7` that isn't explicitly mapped — roll into "Other Expenses".
- This ensures future accounts are never silently excluded.

### Files to Edit
- `src/lib/accounting/chartOfAccounts.ts` — add `4400`/`4401`
- `src/components/accounting/ProfitLossReport.tsx` — readability, accrual basis, invoice revenue line, catch-all accounts, accept `companyView` prop
- `src/components/accounting/BalanceSheetReport.tsx` — readability, add AR and AP lines, accept `companyView` prop
- `src/components/invoices/CreateInvoiceDialog.tsx` — use `4400`/`4401`
- `src/pages/Invoices.tsx` — use `4400`/`4401` for adjustments
- `src/pages/Financials.tsx` — prominent company selector, pass `companyView` to statements
- `src/components/accounting/ChartOfAccounts.tsx` — add `4400`/`4401` to seed list

