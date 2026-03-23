

# Revised Repair Cost & Management Profit System

## Summary

Overhaul the repair tracking to separate **accounting profit** (actual costs) from **management profit** (estimated labor). Repair parts flow through a dedicated PO type. Labor estimates live on the device. The P&L toggle controls which view is shown. Orders show both profit columns.

---

## Current Issues

1. The P&L toggle exists but uses a flawed approach (contra-expense JE + shifting costs between COGS and OpEx). Need to simplify.
2. Repair parts are added via a standalone "Add Part" button — should come through POs.
3. No management labor field on devices.
4. Orders table shows a single profit column.

---

## Plan

### 1. Database Changes

- **`purchase_orders` table**: Add `po_type` column (`text`, default `'inventory'`, values: `'inventory'` | `'repair_parts'`).
- **`purchase_order_items` table**: No change needed — the PO type determines routing on receive.
- **`devices` table**: Add `management_labor_cost` (`numeric`, nullable, default `null`) and `management_labor_hours` (`numeric`, nullable, default `null`).
- **Remove** contra-expense accounts 6950/6951 from `chartOfAccounts.ts` seed data (leave any existing DB rows; just stop creating new JEs).

### 2. Repair Parts PO Type

**CreatePurchaseOrderDialog.tsx**:
- Add a `po_type` selector at the top: "Device Inventory" (default) vs "Repair Parts".
- Save `po_type` to the `purchase_orders` record.

**ReceivePODialog.tsx**:
- When receiving a PO with `po_type = 'repair_parts'`:
  - Instead of creating devices, insert/upsert rows into `repair_parts` (increment `quantity_on_hand`).
  - Match by name/SKU or create new repair part entries.
  - Still create AP entries and GRNs as normal.

**RepairPartsManagement.tsx**:
- Remove the "Add Part" button entirely.
- Keep the search and table display as read-only inventory view.

### 3. Management Labor on Devices

**DeviceEditDialog.tsx**:
- Add two new fields: "Management Labor Hours" and "Management Labor Cost ($)".
- These are optional fields for management reporting only.
- Add a helper tooltip: "Used for management profit calculations. Does not affect accounting books."

### 4. P&L Toggle Rework

**ProfitLossStatement.tsx** — revise the toggle logic:

- **Accounting View** (default):
  - COGS = device purchases (includes capitalized repair parts since they're in `cost_price`).
  - OpEx = all expenses including payroll/labor.
  - This is the standard GAAP view.

- **Management View**:
  - COGS = device purchases + sum of `management_labor_cost` from sold devices in the period.
  - OpEx = all expenses **minus** the payroll/labor expense category.
  - Add explanatory alert for each view.

- Remove the contra-expense JE creation from `DeviceRepairDialog.tsx`.
- Fetch `management_labor_cost` from sold devices to calculate management COGS adjustment.

Update `PLData` interface:
- Replace `capitalizedRepairLabor` with `managementLaborCost` (sum of `management_labor_cost` from devices sold in period).
- Add `payrollExpenses` (labor-category expenses to exclude in management view).
- Keep `repairPartsCost` but note it's already in device `cost_price`.

### 5. Orders Table — Dual Profit Columns

**Sales.tsx**:
- Rename existing "Profit" column header to "Acct Profit".
- Add new "Mgmt Profit" column.
- Accounting profit = existing `profit` field (sale_price - cost_price - fees - shipping - tax).
- Management profit = sale_price - (original_cost_price + repair_parts_cost + management_labor_cost) - fees - shipping - tax.
- This requires joining device data including `original_cost_price` and `management_labor_cost`.

**useSalesQuery.ts**:
- Expand the `devices` select to include `original_cost_price` and `management_labor_cost`.
- Add these to the `SaleRecord` interface.

**SaleRecord interface update**:
```text
devices?: {
  ...existing fields,
  original_cost_price?: number | null;
  management_labor_cost?: number | null;
} | null;
```

### 6. Financials Explanation

Add explanatory content to the P&L view:
- **Accounting View tooltip**: "Standard P&L using actual costs. Device COGS includes purchase price + capitalized repair parts. Labor appears as payroll in Operating Expenses."
- **Management View tooltip**: "Performance P&L. Device COGS includes purchase price + repair parts + estimated labor per device. Payroll expenses are excluded to avoid double-counting."

### 7. DeviceRepairDialog Cleanup

- Remove the JE creation logic (contra-expense entries for 6950/6951).
- Keep the parts deduction and cost capitalization logic (parts cost → device `cost_price`).
- Remove labor cost capitalization into `cost_price` — labor is now tracked separately via `management_labor_cost`.
- On repair completion: only add parts cost to `cost_price`, not labor.

---

## File Changes Summary

| File | Change |
|------|--------|
| DB migration | Add `po_type` to `purchase_orders`, add `management_labor_cost` and `management_labor_hours` to `devices` |
| `CreatePurchaseOrderDialog.tsx` | Add PO type selector |
| `ReceivePODialog.tsx` | Route repair parts POs to `repair_parts` table |
| `RepairPartsManagement.tsx` | Remove "Add Part" button |
| `DeviceEditDialog.tsx` | Add management labor fields |
| `DeviceRepairDialog.tsx` | Remove JE logic, stop capitalizing labor into cost_price |
| `ProfitLossStatement.tsx` | Rework toggle logic, update data fetching |
| `Sales.tsx` | Add "Mgmt Profit" column alongside existing "Acct Profit" |
| `useSalesQuery.ts` | Expand device fields in query |
| `chartOfAccounts.ts` | Remove 6950/6951 accounts from seed |

