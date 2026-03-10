

# Comprehensive Application Analysis and Improvement Plan

## Executive Summary

After thoroughly analyzing all pages, components, edge functions, database schema, and live data, I've identified **critical broken workflows, missing features, and improvement opportunities** across the entire system. Below is a prioritized breakdown.

---

## SECTION 1: BROKEN / INCOMPLETE WORKFLOWS

### 1.1 Returns Have No Accounting Reversal (CRITICAL)

**Current state:** When a return (RMA) is marked as "refunded," the `ReturnsManagement` component only updates the device status. There are **zero** journal entries created to reverse the original sale's accounting treatment.

**What should happen:**
- **Customer return (sales_return):** Reverse the revenue entry (Cr. AR, Dr. Revenue), reverse COGS (Dr. Inventory, Cr. COGS), update device status to `in_stock` or `returned`, and create a refund liability or reduce AR
- **Supplier return (purchase_return):** Reverse the inventory entry (Cr. Inventory, Dr. AP), reduce AP balance, and update device status
- Tax refund amounts should also be reversed in the tax tracking tables

**Fix:** Add a `createReturnJournalEntries()` function to `journalAutomation.ts` and call it from the `updateStatus` handler in `ReturnsManagement.tsx` when status changes to `refunded`.

### 1.2 Intercompany Sales Have No Dual-Sided Accounting (CRITICAL)

**Current state:** `IntercompanySaleDialog` only creates a single `sales` record under the selling company. There is **no** corresponding:
- Purchase/expense record for the buying company
- AR record for the selling company
- AP record for the buying company
- Dual journal entries (Revenue for seller, COGS for buyer)
- Inventory transfer from one company to another

**What should happen:** An intercompany sale should:
1. Create a sale record for the selling company
2. Create an inventory transfer record
3. Update device `company_id` to the buying company
4. Create AR for seller, AP for buyer
5. Create dual journal entries (Dr. AR / Cr. Revenue for seller; Dr. Inventory / Cr. AP for buyer)

### 1.3 No Journal Entries Are Being Created (CRITICAL)

**Current state:** The database shows **zero journal entries** despite having 80 sales records. The `process-sale-accounting` edge function only runs when `device_id` is not null, but **no sales have devices linked** (`device_id` is null for all 80 records). The device matching in importers is finding no matches.

**Root cause:** Inventory has only 6 devices in stock and none match the marketplace SKUs/IMEIs. The accounting pipeline is entirely dormant.

**Fix:** 
- Allow partial accounting (revenue/AR entries) even without a linked device -- COGS can be created later when device is linked
- Currently the edge function has `.not("device_id", "is", null)` which blocks all unlinked sales

### 1.4 Marketplace Status Not Syncing (MODERATE)

**Current state:** All 80 sales have `marketplace_status = null`. The marketplace status sync code was added to the import functions but the existing records were never backfilled, and the cron jobs may not have run since deployment.

**Fix:** Run a one-time backfill by triggering each import function, and verify pg_cron jobs are active.

### 1.5 Unlink Device Missing Accounting Reversal

**Current state:** When a device is unlinked from a sale, the code only clears `device_id` and resets device status. It does **not** reverse the COGS journal entry or update the AR amount.

---

## SECTION 2: TAX HANDLING GAPS

### 2.1 Marketplace Tax Remittance Tracking is Incorrect

**User clarification:** "Marketplaces do not automatically remit taxes to CRA on our behalf. Shopify gives over all tax, Best Buy and Amazon only withhold and remit tax on certain orders."

**Current state:** The system treats all marketplace-collected tax the same way -- as a liability you owe to CRA. This is wrong because:
- **Shopify:** Passes ALL tax through to you -- you must remit to CRA
- **Amazon:** Marketplace-facilitated tax on certain orders -- Amazon remits directly to CRA. You do NOT owe this.
- **Best Buy:** Similar to Amazon -- withholds and remits on certain orders

**Fix needed:**
- Add a `tax_remitted_by_marketplace` boolean or `tax_remittance_type` field to `sales` or `sales_tax_details`
- During import, flag whether the marketplace handles tax remittance
- Tax Dashboard should separate "Tax you owe" vs "Tax marketplace remits" for accurate CRA filing
- Only Shopify-collected tax (and non-marketplace-facilitated Amazon/BBY tax) should count toward your GST/HST return Line 105

### 2.2 Tax Breakdown is Oversimplified

**Current state:** `TaxDashboard` lumps all `tax_amount` from sales into `gstHstCollected`. It does not distinguish GST vs HST vs PST by province, despite having `provincial_tax_rates` and `sales_tax_details` tables.

**Fix:** Use the `sales_tax_details` table (which has `gst_amount`, `hst_amount`, `pst_amount`, `qst_amount`, `is_marketplace_collected`) to provide accurate per-tax-type breakdowns for CRA Lines 101-109.

---

## SECTION 3: MISSING FEATURES

### 3.1 FBA Inventory Separation

**Question from user:** "How can we separate stock we are sending to FBA?"

**Current state:** `FBAInventoryTracker` simply queries all VES `in_stock` devices. There is no way to mark a device as "at FBA warehouse" vs "at our warehouse" vs "in transit to FBA."

**Recommendation:** Add a `warehouse_location` enum or tag system:
- `local` -- at your warehouse
- `fba` -- at Amazon fulfillment center
- `in_transit_fba` -- shipped to FBA, not yet received
- This can leverage the existing `warehouse_location` text field on devices, or add a dedicated `fulfillment_channel` field

### 3.2 Private/Storefront Sales

**Question from user:** "What happens if we sell devices to a private client on storefront rather than on these marketplaces?"

**Current state:** The system supports `marketplace = 'other'` and has `ManualSaleDialog` for recording manual sales, plus an Invoicing module. However:
- Manual sales do NOT trigger accounting automation (the edge function only handles marketplace sales)
- There is no storefront integration
- Invoice-based sales don't link to the accounting pipeline

**Fix:** 
- Extend `process-sale-accounting` to handle `marketplace = 'other'` sales
- When an invoice is marked as paid, it should create the same AR/revenue journal entries
- Private sales should use a direct "Cash" or "Bank" debit instead of AR

### 3.3 Cross-Company Device Linkage Accounting

**Question from user:** "What happens if a device was purchased from VES and is attached to a TGW Shopify order?"

**Current state:** Device matching only looks within the same `company_id`. If a VES-owned device sells on TGW's Shopify, it won't match. If manually linked, the `process-sale-accounting` function uses the sale's `company_id` for all accounting, creating entries under TGW. The VES inventory reduction and intercompany transfer are NOT created.

**Fix:** When a device's `company_id` differs from the sale's `company_id`:
1. Auto-create an intercompany transfer record
2. Create AR for VES (selling entity), AP for TGW (buying entity)
3. Move device `company_id` to TGW
4. Then proceed with normal sale accounting under TGW

### 3.4 Activity Logs Per Section

**Question from user:** "Should there be logs under each section showing which user undertook which action?"

**Current state:** There's an `audit_logs` table and a global Audit Logs page, but no in-context activity feeds. The `useAuditLog` hook exists but is not called from most CRUD operations.

**Recommendation:** 
- Add an `ActivityLog` component that can be embedded in each section (Orders, Inventory, Expenses, etc.)
- Wire up `useAuditLog` calls in all create/update/delete handlers
- Show the last 10-20 actions with user name, timestamp, and what changed
- Include automated accounting actions (e.g., "System created journal entry JE-20260216-0001")

### 3.5 Marketplace Fees/Commission Analytics

**Question from user:** "Should there be a marketplace reports section that shows commissions and fees analytics?"

**Current state:** `MarketplaceAccounting` component exists under Reports and shows revenue, COGS, fees, shipping, and margins per marketplace. However:
- Fees are estimated (Amazon ~15%, Shopify ~2.9%+$0.30) rather than using actual API data
- Best Buy provides actual commission data (`commission_fee`) which is stored correctly
- Amazon's referral fee is hardcoded at 15% -- should use actual fee data from settlement reports
- No trend analysis over time

**Recommendation:**
- For Best Buy: Already storing actual fees -- good
- For Amazon: Integrate the SP-API Settlement Reports endpoint to get actual fees
- For Shopify: Use transaction data from the Orders API (which includes actual payment processing fees)
- Add monthly trend charts for fees by marketplace
- Ensure all fees flow through to the journal entries (which they do via `process-sale-accounting`)

---

## SECTION 4: API DATA NOT FULLY UTILIZED

### 4.1 Amazon SP-API

**Currently used:** Orders API only (7-day lookback)
**Available but unused:**
- **Settlement Reports:** Actual fee breakdowns, tax withheld, net settlement amounts -- critical for accurate AR and fee accounting
- **FBA Inventory API:** Real-time FBA stock levels, which would make `FBAInventoryTracker` accurate instead of inferring from local data
- **Returns API:** Auto-import customer returns instead of manual RMA creation
- **Catalog Items API:** Product details for better device matching

### 4.2 Best Buy (Mirakl) API

**Currently used:** Orders list with customer and commission data
**Available but unused:**
- **Shipping API:** Track shipments and update fulfillment status
- **Returns/Claims API:** Auto-import return requests
- **Document API:** Access invoices and credit notes
- Order state change webhooks for real-time status sync

### 4.3 Shopify API

**Currently used:** Orders list (7-day lookback), webhooks
**Available but unused:**
- **Transactions API:** Actual payment processing fees per order
- **Refunds API:** Auto-detect and import refunds
- **Fulfillment API:** Create/track fulfillments directly
- **Inventory Levels API:** Sync stock counts

---

## SECTION 5: REDUNDANCIES TO REMOVE

### 5.1 Duplicate Accounting Logic
- `src/lib/accounting/journalAutomation.ts` (client-side) and `supabase/functions/process-sale-accounting/index.ts` (server-side) do the **same thing** -- create sale journal entries. The client-side version is never called for sales. Consolidate to the edge function only for sales to avoid confusion.

### 5.2 `vendors` Table vs `suppliers` Table
- Both exist. `vendors` is used by the Expenses module; `suppliers` is used by Inventory/Procurement. These serve different purposes (expense vendors vs inventory suppliers) so they should stay separate, but the naming overlap could be confusing. Consider renaming `vendors` to `expense_vendors` for clarity, or merging if they represent the same entities.

### 5.3 Unused `customers` Table References
- The `customers` table is populated during imports but the dedicated Customers UI was removed. The table still grows with every import. This is fine for backend tracking but should be documented.

---

## SECTION 6: IMPLEMENTATION PRIORITY

### Phase 1 -- Critical Fixes (Accounting Integrity)
1. Fix `process-sale-accounting` to create revenue/AR entries for sales WITHOUT linked devices
2. Add return reversal accounting (journal entries + AR/AP adjustments)
3. Fix intercompany sale to create dual-sided entries
4. Add cross-company device linkage detection and auto-transfer
5. Add unlink device accounting reversal

### Phase 2 -- Tax Accuracy
6. Add `is_marketplace_remitted` flag to sales/tax tracking
7. Update importers to set marketplace tax remittance flags (Shopify = false, Amazon/BBY = conditional)
8. Fix Tax Dashboard to use `sales_tax_details` for proper GST/HST/PST breakdown
9. Separate "tax you owe" vs "tax marketplace remits" in CRA filing report

### Phase 3 -- Operational Improvements
10. Add FBA inventory separation (`fulfillment_channel` field on devices)
11. Wire up `useAuditLog` across all CRUD operations
12. Add embeddable `ActivityLog` component to each section
13. Extend accounting automation to manual/invoice sales
14. Backfill `marketplace_status` on existing sales

### Phase 4 -- API Enrichment
15. Amazon Settlement Reports integration for actual fees
16. Amazon FBA Inventory API for real-time stock
17. Returns API integration (Amazon + Best Buy) for auto-import
18. Shopify Transactions API for actual payment fees

### Phase 5 -- Analytics Enhancement
19. Marketplace commission trend analysis over time
20. Fee comparison dashboard across channels
21. Profitability-per-SKU analysis using actual (not estimated) fees

---

## Technical Changes Summary

**Database migrations needed:**
- Add `is_marketplace_remitted` boolean to `sales` table
- Add `fulfillment_channel` text to `devices` table (values: `local`, `fba`, `in_transit_fba`)
- Potentially add `accounting_status` to `sales` to track which entries have been created

**Edge functions to modify:**
- `process-sale-accounting` -- remove `device_id NOT NULL` requirement, add return reversal support
- `import-amazon-orders` -- add tax remittance flag, consider settlement reports
- `import-bestbuy-orders` -- add tax remittance flag
- `import-shopify-orders` -- add tax remittance flag (all tax = seller responsibility)

**New edge functions:**
- `process-return-accounting` -- handle return reversals
- `process-intercompany-accounting` -- handle dual-sided intercompany entries

**Components to modify:**
- `ReturnsManagement.tsx` -- trigger accounting reversal on refund
- `IntercompanySaleDialog.tsx` -- create dual-sided entries
- `TaxDashboard.tsx` -- use `sales_tax_details` for accurate breakdown
- `FBAInventoryTracker.tsx` -- filter by `fulfillment_channel`
- All CRUD handlers across pages -- add `useAuditLog` calls

**New components:**
- `ActivityLog` -- embeddable per-section activity feed
- `MarketplaceFeeAnalytics` -- commission trend dashboard

