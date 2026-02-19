
-- Add customer phone and GST/HST number to invoices
ALTER TABLE public.invoices 
  ADD COLUMN IF NOT EXISTS customer_phone text,
  ADD COLUMN IF NOT EXISTS customer_gst_hst_number text;

-- Add tax treatment per line item
ALTER TABLE public.invoice_items
  ADD COLUMN IF NOT EXISTS tax_treatment text NOT NULL DEFAULT 'hst';
-- tax_treatment values: 'hst' (13%), 'gst' (5%), 'zero_rated' (0%), 'tax_inclusive' (price includes tax)
