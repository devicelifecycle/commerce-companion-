

## Orders Page Redesign

### Overview
Completely restructure the Orders page to be company-driven (Virtual eShop vs Tech Genius Warehouse), remove the admin-only Dashboard tab, add fulfillment status tracking, show IMEI for linked devices, allow unlinking devices, and add summary metrics at the top.

### Database Migration
Add a `fulfillment_status` column to the `sales` table to track order shipping status:
- Column: `fulfillment_status TEXT DEFAULT 'received'`
- Valid values: `received`, `pending`, `shipped`, `delivered`, `cancelled`

### UI Changes (Sales.tsx - Full Rewrite)

**1. Remove Dashboard Tab**
- Remove the `SalesDashboard` import and the entire Tabs/TabsList/TabsContent structure
- Page opens directly to the orders list (no tabs)

**2. Company Selector (Primary Navigation)**
- Replace the current marketplace filter dropdown with a company toggle at the top:
  - "Virtual eShop" -- filters to `company_id` = VES, shows only Amazon orders
  - "Tech Genius Warehouse" -- filters to `company_id` = TGW, shows Shopify + Best Buy orders
  - "All Companies" option for admins
- Use a button group or segmented control for quick switching
- When a company is selected, the marketplace filter auto-adjusts to show only relevant marketplaces

**3. Summary Metrics Strip**
- Before the table, show 4-5 compact metric cards:
  - Total Orders (count)
  - Orders Received (fulfillment_status = 'received')
  - Pending Shipment (fulfillment_status = 'pending')
  - Shipped (fulfillment_status = 'shipped')
  - Delivered (fulfillment_status = 'delivered')
- These are simple counts, not revenue analytics -- appropriate for all users

**4. Enhanced Filters**
- Search: order number, customer name, IMEI, device brand/model
- Marketplace filter (contextual to selected company)
- Fulfillment status filter (All, Received, Pending, Shipped, Delivered, Cancelled)
- Date range filter

**5. Table Columns Update**
- Checkbox (for bulk actions)
- Order Number + Customer Name
- Device: show `brand model` AND IMEI if linked; "Not linked" badge if not
- Marketplace badge
- Fulfillment Status badge (color-coded)
- Date
- Sale Price
- Actions dropdown:
  - Link Device (if not linked)
  - Unlink Device (if linked) -- new action
  - Update Status (submenu for status changes)
  - Delete

**6. Unlink Device Action**
- New menu item "Unlink Device" when `device_id` is not null
- Sets `device_id` to null on the sale, updates device status back to `in_stock`, and clears `sale_price` on the device

**7. Fulfillment Status Badge**
- Add to `status-badge.tsx` or inline:
  - Received: blue
  - Pending: yellow/amber
  - Shipped: green
  - Delivered: emerald
  - Cancelled: red

### Technical Details

**Files to modify:**
- `src/pages/Sales.tsx` -- major rewrite removing dashboard, adding company selector, status filter, IMEI display, unlink action
- `src/components/sales/EditSaleDialog.tsx` -- minor: already handles link/unlink via "none" option
- `src/components/ui/status-badge.tsx` -- add `FulfillmentBadge` component

**New migration:**
```sql
ALTER TABLE public.sales 
ADD COLUMN fulfillment_status text DEFAULT 'received';
```

**Device query update:**
- Change the select to include IMEI: `devices (brand, model, cost_price, imei)`

**Unlink handler:**
```typescript
const handleUnlinkDevice = async (saleId: string, deviceId: string) => {
  // Update sale to remove device link
  await supabase.from('sales').update({ device_id: null }).eq('id', saleId);
  // Reset device status back to in_stock
  await supabase.from('devices').update({ status: 'in_stock', sale_price: null }).eq('id', deviceId);
  fetchSales();
};
```

**Company filtering logic:**
```typescript
const companyFilter = 'VES' | 'TGW' | 'all';
// VES -> query.eq('company_id', vesId)
// TGW -> query.eq('company_id', tgwId) 
// Uses the company IDs from the companies table
```
