
ALTER TABLE public.return_authorizations
  ADD COLUMN IF NOT EXISTS resolution_type text DEFAULT 'refund',
  ADD COLUMN IF NOT EXISTS device_condition_on_return text DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS replacement_device_id uuid DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS outbound_tracking_number text DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS repair_notes text DEFAULT NULL;

COMMENT ON COLUMN public.return_authorizations.resolution_type IS 'refund, exchange, or repair';
COMMENT ON COLUMN public.return_authorizations.device_condition_on_return IS 'working, defective, damaged, unrepairable';
COMMENT ON COLUMN public.return_authorizations.replacement_device_id IS 'Device sent as replacement (exchange) or repaired device sent back';
COMMENT ON COLUMN public.return_authorizations.outbound_tracking_number IS 'Tracking number for replacement/repaired device shipment';
COMMENT ON COLUMN public.return_authorizations.repair_notes IS 'Details about the repair performed';
