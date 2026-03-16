

## Customers Section Improvements

### 1. Database Migration — Structured Address + Channel

Replace the single `address` text column on `customers` with structured Canadian address fields, and add a `channel` column:

```sql
ALTER TABLE public.customers
  ADD COLUMN IF NOT EXISTS street_address text,
  ADD COLUMN IF NOT EXISTS city text,
  ADD COLUMN IF NOT EXISTS province text,
  ADD COLUMN IF NOT EXISTS postal_code text,
  ADD COLUMN IF NOT EXISTS country text DEFAULT 'Canada';

-- Add channel field
ALTER TABLE public.customers
  ADD COLUMN IF NOT EXISTS channel text DEFAULT NULL;

-- Migrate existing address data into street_address for backward compat
UPDATE public.customers SET street_address = address WHERE address IS NOT NULL;
```

Channel values: `Shopify`, `Amazon`, `Walmart`, `BestBuy`, `Temu`, `eBay`, `In-Store`, `Other`.

### 2. Rewrite Add/Edit Customer Dialog

- Replace single address textarea with: **Street Address**, **City**, **Province** (dropdown of Canadian provinces), **Postal Code**, **Country** (defaulting to Canada).
- Add a **Channel** dropdown with the values above.
- On save, compose a display address from the parts (for backward compat with `address` column or remove it).

### 3. Customer Directory Table Cleanup

- **Remove** the "Orders" column and the "Total Orders" KPI card entirely (data in `total_purchases` is unreliable/not maintained).
- **Source/Channel badge**: Apply color-coded styling per channel with title case:
  - Shopify → green, Amazon → orange, BestBuy → blue, Walmart → indigo, Temu → red, eBay → yellow, In-Store → gray, Other/Manual → secondary.
- Update the source filter dropdown to include all new channel options.

### 4. Bulk Selection + Delete

- Integrate `useTableSelection` hook on the filtered customer list.
- Add checkbox column (header = select all, rows = toggle).
- Show `BatchActionBar` at bottom with bulk delete action.
- Bulk delete calls `supabase.from('customers').delete().in('id', [...selectedIds])`.

### 5. Customer Detail Panel (Order History)

When a customer row is clicked (on the name), open a **Sheet** (slide-over panel) showing:

- **Customer info** header (name, email, phone, address, channel badge).
- **Order History** table: query `sales` where `customer_id = customer.id`, showing order number, date, marketplace, product title, sale price, and status.
- This uses the existing `sales.customer_id` foreign key already in the schema.

### 6. Additional Recommendations (included)

- **Channel column in table**: Show channel badge alongside Source to differentiate acquisition channel from marketplace source.
- **Created date**: Show when the customer was added, formatted nicely.
- **CustomerAutoComplete update**: Update the invoice autocomplete component to also populate the new structured address fields when selecting a customer.

### Files Changed

| File | Change |
|------|--------|
| SQL migration | Add structured address columns + channel to `customers` |
| `src/pages/Customers.tsx` | Full rewrite: structured form, remove orders column/KPI, color-coded badges, bulk select, customer detail sheet with order history |
| `src/components/invoices/CustomerAutoComplete.tsx` | Update selected customer to include new address fields |

