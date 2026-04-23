-- Ensure GRN numbers are unique to prevent collisions when multiple users receive concurrently
CREATE UNIQUE INDEX IF NOT EXISTS goods_received_notes_grn_number_unique
  ON public.goods_received_notes (grn_number);