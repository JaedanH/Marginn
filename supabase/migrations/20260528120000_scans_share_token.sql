-- Public share links: unguessable token per scan + RPC for anonymous read (no broad table exposure).

ALTER TABLE public.scans
  ADD COLUMN IF NOT EXISTS share_token uuid;

-- Backfill existing rows then enforce NOT NULL + default for new inserts
UPDATE public.scans SET share_token = gen_random_uuid() WHERE share_token IS NULL;

ALTER TABLE public.scans ALTER COLUMN share_token SET DEFAULT gen_random_uuid();
ALTER TABLE public.scans ALTER COLUMN share_token SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS scans_share_token_uidx ON public.scans (share_token);

-- Least-privilege public read: only when caller knows the exact token (SECURITY DEFINER).
CREATE OR REPLACE FUNCTION public.get_scan_by_share_token(p_token uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT jsonb_build_object(
    'id', s.id,
    'brand_name', s.brand_name,
    'brand_confidence', s.brand_confidence,
    'image_url', s.image_url,
    'decision', s.decision,
    'expected_resale_gbp', s.expected_resale_gbp,
    'resale_adj_gbp', s.resale_adj_gbp,
    'condition_grade', s.condition_grade,
    'buy_price_gbp', s.buy_price_gbp,
    'net_gbp', s.net_gbp,
    'profit_gbp', s.profit_gbp,
    'mode', s.mode,
    'created_at', s.created_at
  )
  FROM public.scans s
  WHERE s.share_token = p_token
  LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.get_scan_by_share_token(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_scan_by_share_token(uuid) TO anon, authenticated, service_role;
