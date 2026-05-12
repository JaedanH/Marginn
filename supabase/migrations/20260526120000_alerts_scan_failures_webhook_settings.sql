-- Scan failure streaks (Edge-only via service_role RPC) + optional pg_net profile-insert webhook.
-- New-user alerts: prefer Supabase Dashboard → Database Webhooks on `public.profiles` INSERT →
-- Edge `db-webhook-receiver` (see READDY_MIGRATION_NOTES.md). Optional: enable `pg_net` and set URLs in
-- `webhook_alert_settings` (never commit secrets; set via SQL editor or service tooling).

-- ── scan_failure_streaks ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.scan_failure_streaks (
  user_id uuid NOT NULL PRIMARY KEY REFERENCES public.profiles (id) ON DELETE CASCADE,
  failure_count integer NOT NULL DEFAULT 0,
  window_start timestamptz NOT NULL DEFAULT timezone('utc', now()),
  updated_at timestamptz NOT NULL DEFAULT timezone('utc', now())
);

COMMENT ON TABLE public.scan_failure_streaks IS
  'Rolling window counter of analyse-item hard failures per user; updated from Edge only.';

ALTER TABLE public.scan_failure_streaks ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.scan_failure_streaks FROM PUBLIC;
REVOKE ALL ON public.scan_failure_streaks FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.scan_failure_streaks TO service_role;

CREATE OR REPLACE FUNCTION public.scan_failure_streak_record(
  p_user_id uuid,
  p_window_minutes integer
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row public.scan_failure_streaks%ROWTYPE;
  v_win interval;
  v_lim integer;
BEGIN
  IF p_user_id IS NULL THEN
    RETURN jsonb_build_object('count', 0, 'error', 'missing_user');
  END IF;

  v_lim := greatest(1, coalesce(nullif(p_window_minutes, 0), 15));
  v_win := make_interval(mins => v_lim);

  SELECT * INTO v_row FROM public.scan_failure_streaks WHERE user_id = p_user_id FOR UPDATE;

  IF NOT FOUND THEN
    INSERT INTO public.scan_failure_streaks (user_id, failure_count, window_start, updated_at)
    VALUES (p_user_id, 1, timezone('utc', now()), timezone('utc', now()));
    RETURN jsonb_build_object('count', 1);
  END IF;

  IF v_row.window_start < timezone('utc', now()) - v_win THEN
    UPDATE public.scan_failure_streaks
    SET failure_count = 1,
        window_start = timezone('utc', now()),
        updated_at = timezone('utc', now())
    WHERE user_id = p_user_id;
    RETURN jsonb_build_object('count', 1, 'reset', true);
  END IF;

  UPDATE public.scan_failure_streaks
  SET failure_count = v_row.failure_count + 1,
      updated_at = timezone('utc', now())
  WHERE user_id = p_user_id;

  RETURN jsonb_build_object('count', v_row.failure_count + 1);
END;
$$;

REVOKE ALL ON FUNCTION public.scan_failure_streak_record(uuid, integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.scan_failure_streak_record(uuid, integer) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.scan_failure_streak_record(uuid, integer) TO service_role;

COMMENT ON FUNCTION public.scan_failure_streak_record(uuid, integer) IS
  'Increments rolling-window failure count for analyse-item alerts; service_role only.';

-- ── Optional URL + secret for pg_net profile webhook (populated in Dashboard SQL editor) ──
CREATE TABLE IF NOT EXISTS public.webhook_alert_settings (
  id smallint PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  profile_insert_url text,
  profile_insert_secret text
);

INSERT INTO public.webhook_alert_settings (id)
VALUES (1)
ON CONFLICT (id) DO NOTHING;

ALTER TABLE public.webhook_alert_settings ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.webhook_alert_settings FROM PUBLIC;
REVOKE ALL ON public.webhook_alert_settings FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.webhook_alert_settings TO service_role;

COMMENT ON TABLE public.webhook_alert_settings IS
  'Optional targets for DB-side HTTP alerts. Set profile_insert_url (+ optional secret) via SQL; service_role only.';

-- ── pg_net trigger (only when extension is already enabled on the project) ────
DO $do$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_net') THEN
    EXECUTE $fn$
      CREATE OR REPLACE FUNCTION public.trg_profiles_alert_webhook()
      RETURNS trigger
      LANGUAGE plpgsql
      SECURITY DEFINER
      SET search_path = public, net
      AS $body$
      DECLARE
        cfg record;
      BEGIN
        SELECT profile_insert_url, profile_insert_secret
          INTO cfg
        FROM public.webhook_alert_settings
        WHERE id = 1;

        IF cfg.profile_insert_url IS NULL OR length(trim(cfg.profile_insert_url)) = 0 THEN
          RETURN NEW;
        END IF;

        PERFORM net.http_post(
          url := trim(cfg.profile_insert_url),
          headers := jsonb_build_object(
            'Content-Type', 'application/json',
            'X-Webhook-Secret', coalesce(nullif(trim(cfg.profile_insert_secret), ''), '')
          ),
          body := jsonb_build_object(
            'event', 'profile_insert',
            'user_id', NEW.id::text
          )
        );

        RETURN NEW;
      END;
      $body$;
    $fn$;

    DROP TRIGGER IF EXISTS profiles_after_insert_webhook ON public.profiles;
    CREATE TRIGGER profiles_after_insert_webhook
      AFTER INSERT ON public.profiles
      FOR EACH ROW
      EXECUTE PROCEDURE public.trg_profiles_alert_webhook();
  ELSE
    RAISE NOTICE 'pg_net extension not enabled: skipping profile HTTP trigger. Use Dashboard → Database Webhooks (profiles INSERT) or enable pg_net and redeploy migration SQL from docs.';
  END IF;
END
$do$;
