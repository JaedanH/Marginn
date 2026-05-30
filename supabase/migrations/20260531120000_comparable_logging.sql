-- Comparable finder logging: discards (edge) and user removals (client)

CREATE TABLE IF NOT EXISTS public.comparable_discards (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  item_brand text NOT NULL,
  item_type text NOT NULL,
  discarded_listing_title text NOT NULL,
  discarded_price numeric,
  match_score numeric NOT NULL,
  platform text NOT NULL CHECK (platform IN ('ebay', 'vinted', 'depop')),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS comparable_discards_created_at_idx
  ON public.comparable_discards (created_at DESC);

CREATE TABLE IF NOT EXISTS public.comparable_removals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  item_brand text NOT NULL,
  item_type text NOT NULL,
  removed_listing_title text NOT NULL,
  match_score numeric NOT NULL,
  platform text NOT NULL CHECK (platform IN ('ebay', 'vinted', 'depop')),
  user_id uuid REFERENCES auth.users (id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS comparable_removals_user_created_idx
  ON public.comparable_removals (user_id, created_at DESC);

ALTER TABLE public.comparable_discards ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.comparable_removals ENABLE ROW LEVEL SECURITY;

-- Edge (service_role) inserts discards; no client read required
DROP POLICY IF EXISTS comparable_discards_service_insert ON public.comparable_discards;
CREATE POLICY comparable_discards_service_insert
  ON public.comparable_discards
  FOR INSERT
  TO service_role
  WITH CHECK (true);

DROP POLICY IF EXISTS comparable_removals_insert_own ON public.comparable_removals;
CREATE POLICY comparable_removals_insert_own
  ON public.comparable_removals
  FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS comparable_removals_select_own ON public.comparable_removals;
CREATE POLICY comparable_removals_select_own
  ON public.comparable_removals
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

GRANT INSERT ON TABLE public.comparable_discards TO service_role;
GRANT INSERT, SELECT ON TABLE public.comparable_removals TO authenticated;
GRANT ALL ON TABLE public.comparable_discards TO service_role;
GRANT ALL ON TABLE public.comparable_removals TO service_role;
