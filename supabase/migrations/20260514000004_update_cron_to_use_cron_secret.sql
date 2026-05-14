-- Update cron jobs to use x-cron-secret header instead of service role Bearer token.
-- Previous migration (20260514000003) registered jobs with the Bearer token which failed;
-- this migration replaces them with the cron-secret pattern.

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'import-amazon-orders-hourly') THEN
    PERFORM cron.unschedule('import-amazon-orders-hourly');
  END IF;
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'import-bestbuy-orders-30min') THEN
    PERFORM cron.unschedule('import-bestbuy-orders-30min');
  END IF;
END $$;

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
