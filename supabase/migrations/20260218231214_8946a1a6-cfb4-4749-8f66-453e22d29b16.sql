
-- Sync logs table: tracks every marketplace sync run
CREATE TABLE public.sync_logs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  marketplace TEXT NOT NULL, -- 'amazon', 'bestbuy', 'shopify'
  company_id UUID REFERENCES public.companies(id),
  status TEXT NOT NULL DEFAULT 'success', -- 'success', 'failure', 'partial'
  started_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  completed_at TIMESTAMP WITH TIME ZONE,
  records_imported INTEGER NOT NULL DEFAULT 0,
  records_skipped INTEGER NOT NULL DEFAULT 0,
  records_errored INTEGER NOT NULL DEFAULT 0,
  error_message TEXT,
  error_details JSONB,
  sync_type TEXT NOT NULL DEFAULT 'scheduled', -- 'scheduled', 'manual'
  metadata JSONB, -- extra info like API response times, order date ranges
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Data validation issues: flagged anomalies and integrity issues
CREATE TABLE public.data_validation_issues (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  issue_type TEXT NOT NULL, -- 'missing_tax', 'unlinked_inventory', 'fee_anomaly', 'order_gap', 'zero_sale', 'missing_province'
  severity TEXT NOT NULL DEFAULT 'warning', -- 'info', 'warning', 'critical'
  marketplace TEXT,
  company_id UUID REFERENCES public.companies(id),
  record_id UUID, -- reference to the problematic record
  record_type TEXT, -- 'sale', 'device', 'expense'
  description TEXT NOT NULL,
  details JSONB,
  status TEXT NOT NULL DEFAULT 'open', -- 'open', 'acknowledged', 'resolved', 'ignored'
  resolved_at TIMESTAMP WITH TIME ZONE,
  resolved_by UUID,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.sync_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.data_validation_issues ENABLE ROW LEVEL SECURITY;

-- RLS for sync_logs
CREATE POLICY "Users can view sync logs for their companies"
  ON public.sync_logs FOR SELECT
  USING (is_super_admin(auth.uid()) OR has_company_access(auth.uid(), company_id));

CREATE POLICY "Service role can insert sync logs"
  ON public.sync_logs FOR INSERT
  WITH CHECK (true);

-- RLS for data_validation_issues
CREATE POLICY "Users can view validation issues for their companies"
  ON public.data_validation_issues FOR SELECT
  USING (is_super_admin(auth.uid()) OR has_company_access(auth.uid(), company_id));

CREATE POLICY "Users with permission can manage validation issues"
  ON public.data_validation_issues FOR ALL
  USING (has_permission(auth.uid(), company_id, 'accounting_manage', 'edit'));

CREATE POLICY "Service role can insert validation issues"
  ON public.data_validation_issues FOR INSERT
  WITH CHECK (true);

-- Index for performance
CREATE INDEX idx_sync_logs_marketplace ON public.sync_logs(marketplace, started_at DESC);
CREATE INDEX idx_sync_logs_status ON public.sync_logs(status);
CREATE INDEX idx_validation_issues_status ON public.data_validation_issues(status, issue_type);
CREATE INDEX idx_validation_issues_marketplace ON public.data_validation_issues(marketplace);
