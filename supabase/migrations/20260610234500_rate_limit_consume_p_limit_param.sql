-- The live DB had an older rate_limit_consume(p_user_id, p_function_slug, p_rpm);
-- Edge functions call it with named arg p_limit (see 20260524120000_rate_limits.sql),
-- so every analyse-item request failed with 503 E-RATE-LIMIT-CHECK.
-- Recreate with the canonical p_limit signature (param renames need DROP + CREATE).

DROP FUNCTION IF EXISTS public.rate_limit_consume(uuid, text, integer);

CREATE FUNCTION public.rate_limit_consume(
  p_user_id uuid,
  p_function_slug text,
  p_limit integer
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count integer;
  v_oldest timestamptz;
  v_retry integer;
  v_lim integer;
BEGIN
  IF p_user_id IS NULL OR p_function_slug IS NULL OR length(trim(p_function_slug)) = 0 THEN
    RETURN jsonb_build_object('allowed', false, 'retry_after_sec', 60, 'error', 'invalid_arguments');
  END IF;

  v_lim := greatest(1, coalesce(p_limit, 3));

  SELECT count(*)::integer, min(rl.created_at)
    INTO v_count, v_oldest
  FROM public.rate_limits rl
  WHERE rl.user_id = p_user_id
    AND rl.function_slug = p_function_slug
    AND rl.created_at > timezone('utc', now()) - interval '1 minute';

  IF v_count >= v_lim THEN
    IF v_oldest IS NULL THEN
      v_retry := 60;
    ELSE
      v_retry := ceiling(extract(epoch from (v_oldest + interval '1 minute' - timezone('utc', now()))))::integer;
    END IF;
    IF v_retry < 1 THEN
      v_retry := 1;
    END IF;
    RETURN jsonb_build_object('allowed', false, 'retry_after_sec', v_retry);
  END IF;

  INSERT INTO public.rate_limits (user_id, function_slug)
  VALUES (p_user_id, p_function_slug);

  RETURN jsonb_build_object('allowed', true, 'retry_after_sec', 0);
END;
$$;

COMMENT ON FUNCTION public.rate_limit_consume(uuid, text, integer) IS
  'Atomically records one request if under rolling 1-minute RPM; service_role only.';

REVOKE ALL ON FUNCTION public.rate_limit_consume(uuid, text, integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.rate_limit_consume(uuid, text, integer) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.rate_limit_consume(uuid, text, integer) TO service_role;
