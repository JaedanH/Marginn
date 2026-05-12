-- Global scan identification cache (Anthropic vision-equivalent fields only).
-- TTL is enforced in application code: use rows where created_at > now() - interval '48 hours'.
-- Edge function uses service_role only — no browser/client access.

CREATE TABLE IF NOT EXISTS public.scan_identification_cache (
  fingerprint text NOT NULL PRIMARY KEY,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  schema_version integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT timezone('utc', now())
);

CREATE INDEX IF NOT EXISTS idx_scan_identification_cache_created_at
  ON public.scan_identification_cache (created_at DESC);

COMMENT ON TABLE public.scan_identification_cache IS
  'Caches vision-style identification (brand, item, condition) per image fingerprint for 48h; pricing always live in Edge. Global per fingerprint (no user_id).';

ALTER TABLE public.scan_identification_cache ENABLE ROW LEVEL SECURITY;

-- No policies: RLS enabled blocks anon/authenticated; service_role bypasses RLS.

REVOKE ALL ON public.scan_identification_cache FROM PUBLIC;
REVOKE ALL ON public.scan_identification_cache FROM anon, authenticated;
GRANT ALL ON public.scan_identification_cache TO service_role;
