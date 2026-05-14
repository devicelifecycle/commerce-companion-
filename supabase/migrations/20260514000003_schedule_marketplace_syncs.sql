-- Schedule automatic marketplace sync jobs via pg_cron + pg_net.
-- Amazon runs every hour; Best Buy runs every 30 minutes.
-- Functions accept x-cron-secret header (set via Supabase secret CRON_SECRET).

-- Remove any existing schedules to keep this migration idempotent.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'import-amazon-orders-hourly') THEN
    PERFORM cron.unschedule('import-amazon-orders-hourly');
  END IF;
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'import-bestbuy-orders-30min') THEN
    PERFORM cron.unschedule('import-bestbuy-orders-30min');
  END IF;
END $$;

-- Amazon orders — every hour at :05 (slight offset avoids top-of-hour contention)
SELECT cron.schedule(
  'import-amazon-orders-hourly',
  '5 * * * *',
  $$
  SELECT net.http_post(
    url     := 'https://ejvwjgmouxpnddhvcmwy.supabase.co/functions/v1/import-amazon-orders',
    headers := '{"Content-Type":"application/json","x-cron-secret":"8e5f9dff9eefa959d7c7d8f2382d65d8d53b0684db3879136e17509056a5a8f0"}'::jsonb,
    body    := '{}'::jsonb
  ) AS request_id;
  $$
);

-- Best Buy orders — every 30 minutes (:03 and :33)
SELECT cron.schedule(
  'import-bestbuy-orders-30min',
  '3,33 * * * *',
  $$
  SELECT net.http_post(
    url     := 'https://ejvwjgmouxpnddhvcmwy.supabase.co/functions/v1/import-bestbuy-orders',
    headers := '{"Content-Type":"application/json","x-cron-secret":"8e5f9dff9eefa959d7c7d8f2382d65d8d53b0684db3879136e17509056a5a8f0"}'::jsonb,
    body    := '{}'::jsonb
  ) AS request_id;
  $$
);
