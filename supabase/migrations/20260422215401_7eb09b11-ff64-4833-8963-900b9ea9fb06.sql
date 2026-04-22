DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'sales') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.sales;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'devices') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.devices;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'expenses') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.expenses;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'purchase_orders') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.purchase_orders;
  END IF;
END $$;

ALTER TABLE public.sales REPLICA IDENTITY FULL;
ALTER TABLE public.devices REPLICA IDENTITY FULL;
ALTER TABLE public.expenses REPLICA IDENTITY FULL;
ALTER TABLE public.purchase_orders REPLICA IDENTITY FULL;