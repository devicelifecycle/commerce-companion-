

# Restructure Sidebar, Roles, and Remove Customers

## Summary
This plan reorganizes the entire sidebar navigation based on two user types (Admin and Associate), removes the Customers section, breaks the monolithic Accounting page into separate routes, and restructures sidebar groupings to match the requested layout.

---

## New Sidebar Structure

```text
OPERATIONS (visible to all)
  - Dashboard (/)              -- operational order overview
  - Orders (/orders)           -- renamed from "Sales", order-centric view
  - Inventory (/inventory)
  - Import (/import)
  - Suppliers (/suppliers)
  - Invoices (/invoices)

EXPENSE MANAGEMENT (visible to all)
  - Expenses (/expenses)

FINANCE (admin only)
  - Statements
    - Profit & Loss (/statements/profit-loss)
    - Balance Sheet (/statements/balance-sheet)
    - Cash Flow (/statements/cash-flow)        [new page]
  - Accounts Payable (/accounting/ap)
  - Accounts Receivable (/accounting/ar)
  - Tax Center (/taxes)
  - Accounting Guide (/accounting/knowledge)
  - Reports (/reports)
  - Forecasting (/forecasting)

ADMIN (admin only)
  - Team (/team)
  - Audit Logs (/audit-logs)
  - Settings (/settings)
  - Help (/help)
```

---

## Role Simplification

The existing 6-role system (super_admin, company_admin, accountant, sales_manager, operations_staff, view_only) will be simplified in the UI to two conceptual roles:

- **Admin** = `super_admin` or `company_admin` -- sees everything
- **Associate** = all other roles -- sees Operations + Expense Management + Invoices only

The sidebar will conditionally render Finance and Admin sections based on whether the user is an admin. No database migration is needed; this is purely a UI-level filtering using the existing `useCompany` hook's role data.

---

## Detailed Changes

### 1. Remove Customers
- **Delete** `src/pages/Customers.tsx` (or leave file but remove route)
- **Remove** the `/customers` route from `App.tsx`
- **Remove** Customers entry from sidebar nav items

### 2. Restructure AppSidebar.tsx
- Define nav item groups with a `role` flag (`'all'` or `'admin'`)
- Use `useCompany()` to check `isSuperAdmin` or if any assignment role is `company_admin`/`super_admin`
- Conditionally render Finance and Admin groups
- Rename "Sales" to "Orders"
- Move Expenses into its own "Expense Management" group
- Move Suppliers into Operations
- Create a sub-label for "Statements" under Finance

### 3. Break Accounting Page into Separate Routes
Currently `/accounting` is a single tabbed page. We need individual routes:
- `/statements/profit-loss` -- renders `ProfitLossReport`
- `/statements/balance-sheet` -- renders `BalanceSheetReport`
- `/statements/cash-flow` -- new `CashFlowStatement` page (placeholder initially)
- `/accounting/ap` -- renders `AccountsPayable`
- `/accounting/ar` -- renders `AccountsReceivable`
- Keep `/accounting/knowledge` as is

Create thin wrapper pages for each:
- `src/pages/ProfitLoss.tsx`
- `src/pages/BalanceSheet.tsx`
- `src/pages/CashFlow.tsx`
- `src/pages/AccountsPayablePage.tsx`
- `src/pages/AccountsReceivablePage.tsx`

### 4. Update App.tsx Routes
- Remove `/customers` route
- Remove `/sales` route, add `/orders` route (same component, renamed)
- Add new routes: `/statements/profit-loss`, `/statements/balance-sheet`, `/statements/cash-flow`, `/accounting/ap`, `/accounting/ar`
- Remove the monolithic `/accounting` route (keep `/accounting/knowledge`, `/accounting/ap`, `/accounting/ar`)

### 5. Rename Sales to Orders
- Update the `Sales.tsx` page heading from "Sales" to "Orders"
- Update sidebar label from "Sales" to "Orders"
- Update route from `/sales` to `/orders`

### 6. Dashboard as Operational View
- The existing Dashboard already shows order data (recent sales). It will remain the default view for everyone. The "Financial Overview" and "Analytics" sections will be conditionally shown only for admin users by checking the role in `Dashboard.tsx`.

---

## Technical Details

### Files to Create
| File | Purpose |
|------|---------|
| `src/pages/ProfitLoss.tsx` | Wrapper rendering `ProfitLossReport` in `DashboardLayout` |
| `src/pages/BalanceSheet.tsx` | Wrapper rendering `BalanceSheetReport` in `DashboardLayout` |
| `src/pages/CashFlow.tsx` | Cash Flow Statement page (new, using journal entry data) |
| `src/pages/AccountsPayablePage.tsx` | Wrapper rendering `AccountsPayable` in `DashboardLayout` |
| `src/pages/AccountsReceivablePage.tsx` | Wrapper rendering `AccountsReceivable` in `DashboardLayout` |

### Files to Modify
| File | Change |
|------|--------|
| `src/components/layout/AppSidebar.tsx` | Complete restructure of nav groups with role-based visibility |
| `src/App.tsx` | Update routes: remove `/customers`, `/sales`, `/accounting`; add `/orders`, statement routes, AP/AR routes |
| `src/pages/Sales.tsx` | Rename heading to "Orders", keep component logic |
| `src/pages/Dashboard.tsx` | Conditionally hide Financial Overview and Analytics sections for non-admin users |

### Files to Remove (route only)
| File | Action |
|------|--------|
| `src/pages/Customers.tsx` | Remove route from App.tsx (can delete file) |
| `src/pages/Accounting.tsx` | Remove route (functionality split into individual pages) |

### Admin Check Logic (in AppSidebar)
```typescript
const isAdmin = isSuperAdmin || assignments.some(a =>
  ['super_admin', 'company_admin'].includes(a.role)
);
```

This uses the existing `useCompany()` context -- no new database queries needed.

