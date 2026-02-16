
-- Phase 1 & 2: Schema changes for accounting integrity and tax tracking

-- 1. Add accounting_status to sales to track which accounting entries have been created
ALTER TABLE public.sales ADD COLUMN IF NOT EXISTS accounting_status text DEFAULT 'unprocessed';
-- Values: 'unprocessed', 'revenue_only' (no device linked), 'fully_processed' (revenue + COGS)

-- 2. Add is_marketplace_remitted to sales for tax tracking
-- true = marketplace remits tax to CRA on your behalf (Amazon/BBY on certain orders)
-- false = you must remit to CRA (Shopify always, Amazon/BBY on non-facilitated orders)
ALTER TABLE public.sales ADD COLUMN IF NOT EXISTS is_marketplace_remitted boolean DEFAULT false;

-- 3. Add fulfillment_channel to devices for FBA separation
ALTER TABLE public.devices ADD COLUMN IF NOT EXISTS fulfillment_channel text DEFAULT 'local';
-- Values: 'local', 'fba', 'in_transit_fba'

-- 4. Add accounting_status to return_authorizations
ALTER TABLE public.return_authorizations ADD COLUMN IF NOT EXISTS accounting_status text DEFAULT 'unprocessed';

-- 5. Add 'other' marketplace account mappings for private/storefront sales
-- Use TGW accounts (1051, 4101, etc.) as default for 'other' marketplace

-- 6. Create index for faster accounting queries
CREATE INDEX IF NOT EXISTS idx_sales_accounting_status ON public.sales(accounting_status);
CREATE INDEX IF NOT EXISTS idx_sales_is_marketplace_remitted ON public.sales(is_marketplace_remitted);
CREATE INDEX IF NOT EXISTS idx_devices_fulfillment_channel ON public.devices(fulfillment_channel);
CREATE INDEX IF NOT EXISTS idx_return_authorizations_accounting_status ON public.return_authorizations(accounting_status);
