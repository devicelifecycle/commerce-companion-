
-- Table to store marketplace payout/settlement data
CREATE TABLE public.marketplace_payouts (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id UUID REFERENCES public.companies(id),
  marketplace TEXT NOT NULL, -- amazon, shopify, bestbuy
  payout_id TEXT NOT NULL, -- marketplace's payout/settlement ID
  payout_date DATE NOT NULL,
  period_start DATE,
  period_end DATE,
  gross_amount NUMERIC NOT NULL DEFAULT 0, -- total order amounts
  fees_amount NUMERIC NOT NULL DEFAULT 0, -- total fees deducted
  adjustments_amount NUMERIC NOT NULL DEFAULT 0, -- refunds, chargebacks, etc.
  net_payout NUMERIC NOT NULL DEFAULT 0, -- actual amount received
  currency TEXT NOT NULL DEFAULT 'CAD',
  -- Reconciliation fields
  system_order_total NUMERIC, -- sum of orders in our system for this period
  system_fees_total NUMERIC, -- sum of fees in our system
  discrepancy_amount NUMERIC, -- net_payout - (system_order_total - system_fees_total)
  reconciliation_status TEXT NOT NULL DEFAULT 'pending', -- pending, matched, discrepancy, reviewed
  reviewed_by UUID,
  reviewed_at TIMESTAMPTZ,
  review_notes TEXT,
  -- Metadata
  raw_data JSONB, -- full API response for audit
  synced_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(marketplace, payout_id)
);

-- Enable RLS
ALTER TABLE public.marketplace_payouts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view payouts for their companies"
ON public.marketplace_payouts FOR SELECT
USING (is_super_admin(auth.uid()) OR has_company_access(auth.uid(), company_id));

CREATE POLICY "Users with permission can manage payouts"
ON public.marketplace_payouts FOR ALL
USING (has_permission(auth.uid(), company_id, 'accounting_manage', 'edit'));

-- Service role insert for edge functions
CREATE POLICY "Service role can insert payouts"
ON public.marketplace_payouts FOR INSERT
WITH CHECK (true);

-- Index for lookups
CREATE INDEX idx_marketplace_payouts_lookup ON public.marketplace_payouts(marketplace, payout_date DESC);
CREATE INDEX idx_marketplace_payouts_company ON public.marketplace_payouts(company_id);

-- Updated_at trigger
CREATE TRIGGER update_marketplace_payouts_updated_at
BEFORE UPDATE ON public.marketplace_payouts
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
