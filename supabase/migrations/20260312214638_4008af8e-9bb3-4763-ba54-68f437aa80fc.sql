ALTER TABLE public.app_settings
  ADD COLUMN IF NOT EXISTS default_tax_province text DEFAULT 'ON',
  ADD COLUMN IF NOT EXISTS currency_format text DEFAULT 'en-CA',
  ADD COLUMN IF NOT EXISTS auto_generate_sku boolean DEFAULT true,
  ADD COLUMN IF NOT EXISTS default_fulfillment_channel text DEFAULT 'local',
  ADD COLUMN IF NOT EXISTS session_timeout_minutes integer DEFAULT 480,
  ADD COLUMN IF NOT EXISTS reorder_point_threshold integer DEFAULT 3,
  ADD COLUMN IF NOT EXISTS default_invoice_notes text DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS fiscal_year_start_month integer DEFAULT 1;