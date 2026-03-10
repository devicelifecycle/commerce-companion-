

## Plan: Add Accounting Guides Page

### What We're Building

A new **Accounting Guides** page (`/accounting-guides`) under Help & Support that covers three distinct sections:

1. **How This Business Works (General Accounting)** — Standard accrual-basis accounting for a multi-entity electronics resale business in Ontario. Covers IFRS principles, FIFO inventory, GST/HST obligations, double-entry bookkeeping, AP/AR lifecycle, and inter-company transactions as they would work in any traditional accounting setup.

2. **How This Program Is Different** — Documents the custom automation built into this system: auto-generated journal entries on sale/GRN/return, accounting_status pipeline (unprocessed → revenue_only → fully_processed), lot-based cost tracking, shared expense allocation with custom VES/TGW splits, model normalization, duplicate prevention, mandatory payment method enforcement creating AP records, and real-time audit trails.

3. **All Relationships & Charts** — A comprehensive reference of every entity relationship and data flow in the app:
   - Chart of Accounts (all account codes 1000–8101 with descriptions)
   - Entity relationship map: Devices ↔ Import Batches ↔ Suppliers, Sales ↔ Devices ↔ Journal Entries ↔ AR, Purchase Orders ↔ GRN Items ↔ Devices, Invoices ↔ Invoice Items ↔ AR, Expenses ↔ Journal Entries, Returns ↔ Sales ↔ Devices, Tax Filing Periods ↔ Tax Remittances
   - Accounting flow diagrams: Sale lifecycle, Procurement lifecycle, Return lifecycle, Expense allocation, Tax remittance

### Files to Change

1. **Create `src/pages/AccountingGuides.tsx`** — New page with three tabbed sections (General Accounting, Our System, Relationships & Charts). Each section uses accordion-style expandable content matching the existing Guides page pattern. The Relationships tab will include the full chart of accounts rendered from `chartOfAccounts.ts` and textual entity relationship maps.

2. **Edit `src/App.tsx`** — Add route: `/accounting-guides` → `AccountingGuides` component.

3. **Edit `src/components/layout/AppSidebar.tsx`** — Add `{ title: 'Accounting Guides', url: '/accounting-guides', icon: BookOpen }` to `helpNav` array.

4. **Edit `src/pages/Guides.tsx`** — Add a new module entry documenting the Accounting Guides page itself, keeping the self-referencing documentation pattern.

### Technical Details

- The Relationships tab will import `CASH_BASIS_CHART_OF_ACCOUNTS` from `src/lib/accounting/chartOfAccounts.ts` to render the live chart of accounts, ensuring it stays in sync automatically.
- Entity relationships will be described as structured tables showing Source Table → Link Column → Target Table for every foreign key relationship.
- All content is hardcoded in the component (no database dependency), following the same pattern as `Guides.tsx`.
- The "auto-update" commitment will be noted in project memory — any future module or accounting logic changes must include updates to this page.

