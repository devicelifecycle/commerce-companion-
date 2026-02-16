
# Inventory Import Overhaul with Supplier IDs and AP Integration

## Overview
This plan adds a unique 3-digit Supplier ID system, redesigns the inventory import template with new fields (Supplier ID, Invoice Number, Tax Status), adds a post-upload review screen with shipping/invoice matching, and enforces strict case-sensitive data normalization to prevent duplicates.

---

## 1. Database Changes

### Add `supplier_code` column to `suppliers` table
- Add a new `supplier_code` column (text, unique, not null) to store the 3-digit ID (e.g., "001", "002").
- Create a database function `generate_supplier_code()` that finds the next available 3-digit code by querying the max existing code and incrementing.
- Add a trigger so that on INSERT, if `supplier_code` is null, it auto-generates the next code.

### Add `supplier_invoice_number` and `tax_status` columns to `devices` table
- `supplier_invoice_number` (text, nullable) -- the supplier's invoice reference for this batch.
- `tax_status` (text, nullable) -- one of: `tax_included`, `zero_rated`, `gst_paid`, `hst_paid`.

### Add `import_batch_id` to `devices` table
- Links each imported device back to its import batch for the review screen.

### Add shipping/additional cost fields to `import_batches` table
- `shipping_cost` (numeric, default 0)
- `other_charges` (numeric, default 0)
- `supplier_invoice_number` (text, nullable)
- `supplier_id` (uuid, nullable)
- `company_id` (uuid, nullable)
- `is_finalized` (boolean, default false) -- locks the batch after review

---

## 2. Supplier Section Changes (`src/pages/Suppliers.tsx`)

- Display the auto-generated `supplier_code` (e.g., "S-001") in the suppliers table as the first column labeled "Supplier ID".
- The code is read-only and auto-assigned on creation -- users cannot edit it.
- Add the Supplier ID to the search filter.
- Show a note/instruction explaining that the Supplier ID should be used in inventory import templates.

---

## 3. Import Template Redesign (`src/pages/Import.tsx`)

### New template columns (download template updated):
| Column | Required | Notes |
|---|---|---|
| Company | Yes | VES or TGW only |
| Category | Yes | phone, laptop, tablet, accessory, smartwatch, other |
| Brand | Yes | Case-sensitive, e.g., "Apple" not "apple" |
| Model | Yes | Case-sensitive, e.g., "iPhone 12 Pro Max" |
| IMEI/Serial/Unique ID | Yes | Must be unique |
| Storage | No | e.g., "256GB" |
| Colour | No | e.g., "Space Black" |
| Cost Price | Yes | Numeric |
| Notes | No | Free text |
| Supplier ID | Yes | 3-digit code from Suppliers section |
| Supplier Invoice Number | No | For AP matching |
| Purchase Date | No | Defaults to today |
| Tax Status | No | "Tax Included", "Zero-Rated", "GST Paid", "HST Paid" |

**Removed columns**: SKU (auto-generated), Condition (not needed), Sale Price (not relevant at import).

### Column mapping updates:
- Remove `sku`, `condition`, `sale_price` from `ColumnMapping` interface.
- Add `supplier_id_code`, `supplier_invoice_number`, `tax_status` fields.
- Update auto-mapping logic for the new columns.

### Data normalization and validation rules:
- **Brand**: Validate against a known brands list or enforce Title Case (first letter capital). Flag if inconsistent casing is detected (e.g., "apple" vs "Apple").
- **Model**: Enforce exact case sensitivity. Warn if similar model names differ only by case.
- **Company**: Must be exactly "VES" or "TGW" -- reject otherwise.
- **IMEI/Serial**: Must be unique across the file AND database.
- **Supplier ID**: Must match an existing `supplier_code` in the suppliers table. Reject if not found.
- **Tax Status**: Must be one of the 4 valid options if provided.
- Display import rules/instructions as an info panel on the upload step.

### Auto-SKU generation:
- After import, auto-generate SKU based on: `{Brand abbreviation}-{Model abbreviation}-{Storage}-{sequence}`, e.g., `APL-IP15PM-256-001`.

---

## 4. Post-Import Review Screen (New Step)

After the current "results" step, add a **review/finalize** step:

- Show a summary card with:
  - Total items imported, grouped by supplier
  - Subtotal (sum of cost prices)
  - Tax breakdown based on Tax Status per item
  - Editable fields for: **Shipping Cost**, **Other Charges**
  - Calculated **Invoice Total** = Subtotal + Tax + Shipping + Other
  - Supplier Invoice Number (pre-filled from template if provided)

- A "Finalize & Create AP" button that:
  1. Saves shipping/other charges to the `import_batches` record.
  2. Creates an **Accounts Payable** record with:
     - `vendor_name` = supplier name
     - `bill_number` = supplier invoice number
     - `original_amount` = invoice total
     - `company_id` = the target company (VES means Virtual eShop owes this supplier)
     - `category` = "inventory_purchase"
     - Tax amounts calculated from the tax status of items
  3. Creates the corresponding **Purchase Order** and **Goods Received Note** (using existing `automatedImport.ts` logic).
  4. Creates the appropriate **journal entries** for the inventory purchase.
  5. Marks the batch as `is_finalized = true`.

---

## 5. Instructions Panel

Add a collapsible instructions/rules panel on the Import page (visible on the upload step) that explains:

- Use exact casing for Brand names (e.g., "Apple" not "APPLE" or "apple")
- Use exact casing for Model names (e.g., "iPhone 12 Pro Max" not "iphone 12 Pro max")
- Company must be exactly "VES" or "TGW"
- Supplier ID must be obtained from the Suppliers section first
- IMEI/Serial must be unique -- duplicates will be rejected
- SKU is auto-assigned and should not be included
- Tax Status options: "Tax Included", "Zero-Rated", "GST Paid", "HST Paid"

---

## Technical Details

### Files to create:
- None (all changes in existing files)

### Files to modify:
- **Database migration** -- new columns on `suppliers`, `devices`, `import_batches`
- `src/pages/Suppliers.tsx` -- show supplier code column, instructions
- `src/pages/Import.tsx` -- redesigned template, new validation, review step, AP creation, instructions panel
- `src/lib/import/automatedImport.ts` -- update to accept tax status and invoice number parameters

### Accounting flow on finalize:
```text
When "VES" is the company in the template:
  --> AP created under Virtual eShop, payable to the supplier
  --> PO created under Virtual eShop
  --> GRN created under Virtual eShop
  --> Journal: Dr. Inventory (1100) + Dr. GST/HST ITC (if applicable)
               Cr. Accounts Payable
```
