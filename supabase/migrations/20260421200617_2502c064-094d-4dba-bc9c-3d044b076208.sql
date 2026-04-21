-- Add marketplace_account column to sales for differentiating multiple seller accounts on same marketplace
ALTER TABLE public.sales ADD COLUMN IF NOT EXISTS marketplace_account text;

-- Backfill existing Best Buy rows to TGW account
UPDATE public.sales
SET marketplace_account = 'bestbuy_tgw'
WHERE marketplace = 'bestbuy' AND marketplace_account IS NULL;

-- Index for filtering perf
CREATE INDEX IF NOT EXISTS idx_sales_marketplace_account ON public.sales(marketplace, marketplace_account);

-- Mirror on marketplace_payouts for symmetry
ALTER TABLE public.marketplace_payouts ADD COLUMN IF NOT EXISTS marketplace_account text;

UPDATE public.marketplace_payouts
SET marketplace_account = 'bestbuy_tgw'
WHERE marketplace = 'bestbuy' AND marketplace_account IS NULL;

CREATE INDEX IF NOT EXISTS idx_marketplace_payouts_account ON public.marketplace_payouts(marketplace, marketplace_account);