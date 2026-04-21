-- Add suspense pipeline columns to sales
ALTER TABLE public.sales
  ADD COLUMN IF NOT EXISTS review_reason text,
  ADD COLUMN IF NOT EXISTS shipping_province text,
  ADD COLUMN IF NOT EXISTS province_inferred boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS gates_checked_at timestamp with time zone,
  ADD COLUMN IF NOT EXISTS ready_to_post_at timestamp with time zone,
  ADD COLUMN IF NOT EXISTS posted_at timestamp with time zone,
  ADD COLUMN IF NOT EXISTS posted_by uuid;

-- Index for fast Suspense Tray queries
CREATE INDEX IF NOT EXISTS idx_sales_accounting_status_company
  ON public.sales (company_id, accounting_status)
  WHERE accounting_status IN ('pending_review', 'ready_to_post', 'needs_review');

-- Index for daily auto-resolve cron
CREATE INDEX IF NOT EXISTS idx_sales_pending_review
  ON public.sales (accounting_status, created_at)
  WHERE accounting_status = 'pending_review';

-- Trigger to stamp gates_checked_at when status moves to ready_to_post or needs_review
CREATE OR REPLACE FUNCTION public.stamp_sales_gate_check()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.accounting_status IN ('ready_to_post', 'needs_review')
     AND (OLD.accounting_status IS DISTINCT FROM NEW.accounting_status) THEN
    NEW.gates_checked_at := now();
    IF NEW.accounting_status = 'ready_to_post' AND NEW.ready_to_post_at IS NULL THEN
      NEW.ready_to_post_at := now();
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_stamp_sales_gate_check ON public.sales;
CREATE TRIGGER trg_stamp_sales_gate_check
  BEFORE UPDATE ON public.sales
  FOR EACH ROW
  EXECUTE FUNCTION public.stamp_sales_gate_check();