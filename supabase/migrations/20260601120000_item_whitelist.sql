-- Weekly scrape target: sold/listed comps per brand × platform for pricing whitelist accuracy.

CREATE TABLE IF NOT EXISTS public.item_whitelist (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  brand text NOT NULL,
  platform text NOT NULL CHECK (platform IN ('ebay', 'vinted', 'depop')),
  listing_id text NOT NULL,
  listing_title text NOT NULL,
  price numeric NOT NULL CHECK (price > 0),
  condition text,
  category text,
  image_url text,
  listing_url text,
  date_scraped timestamptz NOT NULL DEFAULT now(),
  date_sold timestamptz,
  item_type text NOT NULL DEFAULT 'unknown',
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT item_whitelist_platform_listing_id_key UNIQUE (platform, listing_id)
);

CREATE INDEX IF NOT EXISTS item_whitelist_brand_platform_idx
  ON public.item_whitelist (brand, platform);

CREATE INDEX IF NOT EXISTS item_whitelist_date_scraped_idx
  ON public.item_whitelist (date_scraped DESC);

CREATE INDEX IF NOT EXISTS item_whitelist_item_type_idx
  ON public.item_whitelist (brand, item_type);

COMMENT ON TABLE public.item_whitelist IS
  'Curated marketplace listings per brand (weekly build-whitelist Edge Function). Deduped by (platform, listing_id).';

COMMENT ON COLUMN public.item_whitelist.listing_id IS
  'Platform-native id: eBay itemId, Vinted numeric item id, Depop product id segment.';

COMMENT ON COLUMN public.item_whitelist.date_sold IS
  'eBay sold end time when available; null for active Vinted/Depop listings.';

ALTER TABLE public.item_whitelist ENABLE ROW LEVEL SECURITY;

-- Edge (service_role) writes; optional read for authenticated app later
DROP POLICY IF EXISTS item_whitelist_service_all ON public.item_whitelist;
CREATE POLICY item_whitelist_service_all
  ON public.item_whitelist
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

DROP POLICY IF EXISTS item_whitelist_select_authenticated ON public.item_whitelist;
CREATE POLICY item_whitelist_select_authenticated
  ON public.item_whitelist
  FOR SELECT
  TO authenticated
  USING (true);

GRANT SELECT ON TABLE public.item_whitelist TO authenticated;
GRANT ALL ON TABLE public.item_whitelist TO service_role;
