-- After-scan: resale watchlist (48h baseline) + bought/sold outcome fields on scans.
-- Client compares expected_resale_gbp vs baseline on next dashboard open (no pg_cron in this migration).

-- ── scans: outcome columns ────────────────────────────────────────────────────
ALTER TABLE public.scans ADD COLUMN IF NOT EXISTS bought_at timestamptz;
ALTER TABLE public.scans ADD COLUMN IF NOT EXISTS bought_price_gbp numeric;
ALTER TABLE public.scans ADD COLUMN IF NOT EXISTS sold_at timestamptz;
ALTER TABLE public.scans ADD COLUMN IF NOT EXISTS sold_price_gbp numeric;

COMMENT ON COLUMN public.scans.bought_at IS 'When the user confirmed they purchased the item.';
COMMENT ON COLUMN public.scans.bought_price_gbp IS 'Confirmed purchase price (£); may differ from buy_price_gbp estimate at scan time.';
COMMENT ON COLUMN public.scans.sold_at IS 'When the user recorded a sale.';
COMMENT ON COLUMN public.scans.sold_price_gbp IS 'Actual sale price (£) for realized profit.';

-- ── scan_watchlist: 48h resale tracking (baseline at watch time) ──────────────
CREATE TABLE IF NOT EXISTS public.scan_watchlist (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  scan_id uuid NOT NULL REFERENCES public.scans (id) ON DELETE CASCADE,
  baseline_resale_gbp numeric NOT NULL,
  created_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  checked_at timestamptz
);

CREATE UNIQUE INDEX IF NOT EXISTS scan_watchlist_user_scan_uidx
  ON public.scan_watchlist (user_id, scan_id);

CREATE INDEX IF NOT EXISTS scan_watchlist_user_created_idx
  ON public.scan_watchlist (user_id, created_at DESC);

ALTER TABLE public.scan_watchlist ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.scan_watchlist TO authenticated;
GRANT ALL ON TABLE public.scan_watchlist TO service_role;

DROP POLICY IF EXISTS scan_watchlist_select_own ON public.scan_watchlist;
CREATE POLICY scan_watchlist_select_own
  ON public.scan_watchlist
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS scan_watchlist_insert_own_scan ON public.scan_watchlist;
CREATE POLICY scan_watchlist_insert_own_scan
  ON public.scan_watchlist
  FOR INSERT
  TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    AND EXISTS (
      SELECT 1
      FROM public.scans s
      WHERE s.id = scan_watchlist.scan_id
        AND s.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS scan_watchlist_update_own ON public.scan_watchlist;
CREATE POLICY scan_watchlist_update_own
  ON public.scan_watchlist
  FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS scan_watchlist_delete_own ON public.scan_watchlist;
CREATE POLICY scan_watchlist_delete_own
  ON public.scan_watchlist
  FOR DELETE
  TO authenticated
  USING (user_id = auth.uid());

COMMENT ON TABLE public.scan_watchlist IS
  'User-chosen resale watch: baseline_resale_gbp captured at watch time; app compares on next visit. No server cron — optional pg_cron + Edge in a later phase.';
