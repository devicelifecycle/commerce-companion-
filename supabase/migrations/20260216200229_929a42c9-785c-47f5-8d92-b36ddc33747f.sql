
-- Add marketplace_status column to store raw status from each marketplace
ALTER TABLE public.sales 
ADD COLUMN marketplace_status text;

-- Comment for documentation
COMMENT ON COLUMN public.sales.marketplace_status IS 'Raw order status from the marketplace (e.g. Shopify: paid/voided, Amazon: Unshipped/Shipped, Best Buy: WAITING_ACCEPTANCE/SHIPPING)';
