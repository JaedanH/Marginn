-- Optional weekly pg_cron → build-whitelist Edge Function.
-- Requires: pg_cron + pg_net on the project (enable in Dashboard → Database → Extensions).
-- Replace YOUR_PROJECT_REF and store service role in Vault as `service_role_key` (see Supabase cron docs),
-- OR use Dashboard → Edge Functions → build-whitelist → Cron instead of this migration.

CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

DO $$
DECLARE
  job_exists boolean;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM cron.job WHERE jobname = 'build-whitelist-weekly'
  ) INTO job_exists;

  IF job_exists THEN
    RAISE NOTICE 'build_whitelist_cron: job build-whitelist-weekly already exists — skip';
    RETURN;
  END IF;

  -- Sunday 03:00 UTC — processes brands in batches via default body (see function header).
  -- Uncomment and set project URL + vault secret after deploy:
  --
  -- PERFORM cron.schedule(
  --   'build-whitelist-weekly',
  --   '0 3 * * 0',
  --   $cron$
  --   SELECT net.http_post(
  --     url := 'https://YOUR_PROJECT_REF.supabase.co/functions/v1/build-whitelist',
  --     headers := jsonb_build_object(
  --       'Content-Type', 'application/json',
  --       'Authorization', 'Bearer ' || (
  --         SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'service_role_key' LIMIT 1
  --       )
  --     ),
  --     body := '{"brand_offset":0,"brand_limit":4,"chain":true}'::jsonb
  --   ) AS request_id;
  --   $cron$
  -- );

  RAISE NOTICE 'build_whitelist_cron: pg_cron extensions ensured; schedule build-whitelist-weekly via Dashboard or uncomment SQL above after vault setup';
END $$;
