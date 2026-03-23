
ALTER TABLE public.return_authorizations 
  ADD COLUMN IF NOT EXISTS marketplace_initiated boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS refund_reason_detail text;
