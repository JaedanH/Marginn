-- Let signed-in users read and insert their own scan rows.
-- Required when analyse-item uses the anon key + caller JWT (no service role),
-- and for the scan page client-side fallback insert into public.scans.
--
-- Table DDL was historically created only in the Supabase dashboard; this block
-- ensures `supabase db reset` / fresh `db push` does not fail on missing `scans`.

CREATE TABLE IF NOT EXISTS public.scans (
  id uuid NOT NULL PRIMARY KEY,
  user_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  brand_name text NOT NULL DEFAULT '',
  brand_confidence double precision NOT NULL DEFAULT 0,
  item_type_bucket text NOT NULL DEFAULT 'MED',
  condition_grade text NOT NULL DEFAULT 'GOOD',
  trend_score integer NOT NULL DEFAULT 5,
  buy_price_gbp numeric,
  expected_resale_gbp numeric,
  resale_adj_gbp numeric,
  net_gbp numeric,
  profit_gbp numeric,
  roi numeric,
  mode text NOT NULL DEFAULT 'STANDARD',
  platform text NOT NULL DEFAULT 'web',
  decision text NOT NULL DEFAULT 'MAYBE',
  image_url text
);

ALTER TABLE public.scans ADD COLUMN IF NOT EXISTS user_id uuid;
ALTER TABLE public.scans ADD COLUMN IF NOT EXISTS created_at timestamptz NOT NULL DEFAULT timezone('utc', now());
ALTER TABLE public.scans ADD COLUMN IF NOT EXISTS brand_name text NOT NULL DEFAULT '';
ALTER TABLE public.scans ADD COLUMN IF NOT EXISTS brand_confidence double precision NOT NULL DEFAULT 0;
ALTER TABLE public.scans ADD COLUMN IF NOT EXISTS item_type_bucket text NOT NULL DEFAULT 'MED';
ALTER TABLE public.scans ADD COLUMN IF NOT EXISTS condition_grade text NOT NULL DEFAULT 'GOOD';
ALTER TABLE public.scans ADD COLUMN IF NOT EXISTS trend_score integer NOT NULL DEFAULT 5;
ALTER TABLE public.scans ADD COLUMN IF NOT EXISTS buy_price_gbp numeric;
ALTER TABLE public.scans ADD COLUMN IF NOT EXISTS expected_resale_gbp numeric;
ALTER TABLE public.scans ADD COLUMN IF NOT EXISTS resale_adj_gbp numeric;
ALTER TABLE public.scans ADD COLUMN IF NOT EXISTS net_gbp numeric;
ALTER TABLE public.scans ADD COLUMN IF NOT EXISTS profit_gbp numeric;
ALTER TABLE public.scans ADD COLUMN IF NOT EXISTS roi numeric;
ALTER TABLE public.scans ADD COLUMN IF NOT EXISTS mode text NOT NULL DEFAULT 'STANDARD';
ALTER TABLE public.scans ADD COLUMN IF NOT EXISTS platform text NOT NULL DEFAULT 'web';
ALTER TABLE public.scans ADD COLUMN IF NOT EXISTS decision text NOT NULL DEFAULT 'MAYBE';
ALTER TABLE public.scans ADD COLUMN IF NOT EXISTS image_url text;

GRANT SELECT, INSERT ON public.scans TO authenticated;
GRANT ALL ON public.scans TO service_role;

ALTER TABLE public.scans ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "scans_select_own" ON public.scans;
CREATE POLICY "scans_select_own"
  ON public.scans
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "scans_insert_own" ON public.scans;
CREATE POLICY "scans_insert_own"
  ON public.scans
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);
