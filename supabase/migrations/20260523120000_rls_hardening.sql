-- RLS hardening: profiles, referrals, saved_items, listing_cache, brand_aliases, waitlist,
-- plus grants and optional scans UPDATE/DELETE for own rows.
-- service_role bypasses RLS (Edge functions where SUPABASE_SERVICE_ROLE_KEY is set).
--
-- Tables not present in the database are skipped via DO blocks (see bottom NOTICEs).
-- Repo note: `brand_aliases` is not referenced in application code; policy is optional catalog read.
-- Repo note: `saved_items` is used from the client but has no CREATE TABLE in older migrations —
--             policies apply only when the table exists.

-- ── Referral signup: strict profiles RLS would block SELECT by referral_code; use DEFINER RPC ──
CREATE OR REPLACE FUNCTION public.profile_id_for_referral_code(p_code text)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT p.id
  FROM public.profiles p
  WHERE p.referral_code IS NOT NULL
    AND lower(trim(p.referral_code)) = lower(trim(p_code))
  LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.profile_id_for_referral_code(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.profile_id_for_referral_code(text) TO authenticated;

COMMENT ON FUNCTION public.profile_id_for_referral_code(text) IS
  'Lookup referrer profile id by referral_code; SECURITY DEFINER so strict profiles RLS does not expose other rows via broad SELECT.';

-- ── profiles ─────────────────────────────────────────────────────────────────
DO $$
BEGIN
  IF to_regclass('public.profiles') IS NULL THEN
    RAISE NOTICE 'rls_hardening: skip profiles — table public.profiles does not exist';
    RETURN;
  END IF;

  ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

  DROP POLICY IF EXISTS profiles_select_own ON public.profiles;
  CREATE POLICY profiles_select_own
    ON public.profiles
    FOR SELECT
    TO authenticated
    USING (id = auth.uid());

  DROP POLICY IF EXISTS profiles_update_own ON public.profiles;
  CREATE POLICY profiles_update_own
    ON public.profiles
    FOR UPDATE
    TO authenticated
    USING (id = auth.uid())
    WITH CHECK (id = auth.uid());

  DROP POLICY IF EXISTS profiles_insert_own ON public.profiles;
  CREATE POLICY profiles_insert_own
    ON public.profiles
    FOR INSERT
    TO authenticated
    WITH CHECK (id = auth.uid());

  GRANT SELECT, INSERT, UPDATE ON TABLE public.profiles TO authenticated;
  GRANT ALL ON TABLE public.profiles TO service_role;
END $$;

-- ── scans: keep partner migration policies; add UPDATE/DELETE for own rows only ─────────────
DO $$
BEGIN
  IF to_regclass('public.scans') IS NULL THEN
    RAISE NOTICE 'rls_hardening: skip scans — table public.scans does not exist';
    RETURN;
  END IF;

  ALTER TABLE public.scans ENABLE ROW LEVEL SECURITY;

  DROP POLICY IF EXISTS scans_update_own ON public.scans;
  CREATE POLICY scans_update_own
    ON public.scans
    FOR UPDATE
    TO authenticated
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

  DROP POLICY IF EXISTS scans_delete_own ON public.scans;
  CREATE POLICY scans_delete_own
    ON public.scans
    FOR DELETE
    TO authenticated
    USING (auth.uid() = user_id);

  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.scans TO authenticated;
  GRANT ALL ON TABLE public.scans TO service_role;
END $$;

-- ── referrals ────────────────────────────────────────────────────────────────
DO $$
BEGIN
  IF to_regclass('public.referrals') IS NULL THEN
    RAISE NOTICE 'rls_hardening: skip referrals — table public.referrals does not exist';
    RETURN;
  END IF;

  ALTER TABLE public.referrals ENABLE ROW LEVEL SECURITY;

  DROP POLICY IF EXISTS referrals_select_as_party ON public.referrals;
  CREATE POLICY referrals_select_as_party
    ON public.referrals
    FOR SELECT
    TO authenticated
    USING (
      auth.uid() = referrer_user_id
      OR auth.uid() = referred_user_id
    );

  DROP POLICY IF EXISTS referrals_insert_as_referred ON public.referrals;
  CREATE POLICY referrals_insert_as_referred
    ON public.referrals
    FOR INSERT
    TO authenticated
    WITH CHECK (auth.uid() = referred_user_id);

  GRANT SELECT, INSERT ON TABLE public.referrals TO authenticated;
  GRANT ALL ON TABLE public.referrals TO service_role;
END $$;

-- ── saved_items: access only when linked to own scan (or scan_id null + own user_id) ────────
DO $$
BEGIN
  IF to_regclass('public.saved_items') IS NULL THEN
    RAISE NOTICE 'rls_hardening: skip saved_items — table public.saved_items does not exist';
    RETURN;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'saved_items' AND column_name = 'user_id'
  ) THEN
    RAISE NOTICE 'rls_hardening: skip saved_items policies — column user_id missing';
    RETURN;
  END IF;

  ALTER TABLE public.saved_items ENABLE ROW LEVEL SECURITY;

  -- When scan_id exists: require own user_id and (null scan or scan owned by caller).
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'saved_items' AND column_name = 'scan_id'
  ) THEN
    DROP POLICY IF EXISTS saved_items_select_own_scan ON public.saved_items;
    CREATE POLICY saved_items_select_own_scan
      ON public.saved_items
      FOR SELECT
      TO authenticated
      USING (
        user_id = auth.uid()
        AND (
          scan_id IS NULL
          OR EXISTS (
            SELECT 1 FROM public.scans s
            WHERE s.id = scan_id
              AND s.user_id = auth.uid()
          )
        )
      );

    DROP POLICY IF EXISTS saved_items_insert_own_scan ON public.saved_items;
    CREATE POLICY saved_items_insert_own_scan
      ON public.saved_items
      FOR INSERT
      TO authenticated
      WITH CHECK (
        user_id = auth.uid()
        AND (
          scan_id IS NULL
          OR EXISTS (
            SELECT 1 FROM public.scans s
            WHERE s.id = scan_id
              AND s.user_id = auth.uid()
          )
        )
      );

    DROP POLICY IF EXISTS saved_items_delete_own_scan ON public.saved_items;
    CREATE POLICY saved_items_delete_own_scan
      ON public.saved_items
      FOR DELETE
      TO authenticated
      USING (
        user_id = auth.uid()
        AND (
          scan_id IS NULL
          OR EXISTS (
            SELECT 1 FROM public.scans s
            WHERE s.id = scan_id
              AND s.user_id = auth.uid()
          )
        )
      );
  ELSE
    RAISE NOTICE 'rls_hardening: saved_items has no scan_id — applying user_id-only policies';
    DROP POLICY IF EXISTS saved_items_select_own ON public.saved_items;
    CREATE POLICY saved_items_select_own
      ON public.saved_items
      FOR SELECT
      TO authenticated
      USING (user_id = auth.uid());

    DROP POLICY IF EXISTS saved_items_insert_own ON public.saved_items;
    CREATE POLICY saved_items_insert_own
      ON public.saved_items
      FOR INSERT
      TO authenticated
      WITH CHECK (user_id = auth.uid());

    DROP POLICY IF EXISTS saved_items_delete_own ON public.saved_items;
    CREATE POLICY saved_items_delete_own
      ON public.saved_items
      FOR DELETE
      TO authenticated
      USING (user_id = auth.uid());
  END IF;

  GRANT SELECT, INSERT, DELETE ON TABLE public.saved_items TO authenticated;
  GRANT ALL ON TABLE public.saved_items TO service_role;
END $$;

-- ── listing_cache: merge with 20260510120000 (insert own scan); add SELECT; partner-aware ─
DO $$
BEGIN
  IF to_regclass('public.listing_cache') IS NULL THEN
    RAISE NOTICE 'rls_hardening: skip listing_cache — table public.listing_cache does not exist';
    RETURN;
  END IF;

  ALTER TABLE public.listing_cache ENABLE ROW LEVEL SECURITY;

  -- Replace legacy policy name from 20260510120000_listing_cache_insert_own_scans.sql
  DROP POLICY IF EXISTS "Users insert listing_cache for own scans" ON public.listing_cache;

  DROP POLICY IF EXISTS listing_cache_insert_for_accessible_scan ON public.listing_cache;
  CREATE POLICY listing_cache_insert_for_accessible_scan
    ON public.listing_cache
    FOR INSERT
    TO authenticated
    WITH CHECK (
      EXISTS (
        SELECT 1
        FROM public.scans s
        WHERE s.id = listing_cache.scan_id
          AND (
            s.user_id = auth.uid()
            OR (
              s.partner_shop_id IS NOT NULL
              AND EXISTS (
                SELECT 1
                FROM public.profiles p
                WHERE p.id = auth.uid()
                  AND p.role = 'partner'
                  AND p.partner_shop_id IS NOT NULL
                  AND p.partner_shop_id = s.partner_shop_id
              )
            )
          )
      )
    );

  DROP POLICY IF EXISTS listing_cache_select_for_accessible_scan ON public.listing_cache;
  CREATE POLICY listing_cache_select_for_accessible_scan
    ON public.listing_cache
    FOR SELECT
    TO authenticated
    USING (
      EXISTS (
        SELECT 1
        FROM public.scans s
        WHERE s.id = listing_cache.scan_id
          AND (
            s.user_id = auth.uid()
            OR (
              s.partner_shop_id IS NOT NULL
              AND EXISTS (
                SELECT 1
                FROM public.profiles p
                WHERE p.id = auth.uid()
                  AND p.role = 'partner'
                  AND p.partner_shop_id IS NOT NULL
                  AND p.partner_shop_id = s.partner_shop_id
              )
            )
          )
      )
    );

  GRANT SELECT, INSERT ON TABLE public.listing_cache TO authenticated;
  GRANT ALL ON TABLE public.listing_cache TO service_role;
END $$;

-- ── brand_aliases (optional catalog): not referenced in repo — skip if missing ─────────────
DO $$
BEGIN
  IF to_regclass('public.brand_aliases') IS NULL THEN
    RAISE NOTICE 'rls_hardening: skip brand_aliases — table public.brand_aliases does not exist';
    RETURN;
  END IF;

  ALTER TABLE public.brand_aliases ENABLE ROW LEVEL SECURITY;

  DROP POLICY IF EXISTS brand_aliases_select_authenticated ON public.brand_aliases;
  CREATE POLICY brand_aliases_select_authenticated
    ON public.brand_aliases
    FOR SELECT
    TO authenticated
    USING (true);

  REVOKE ALL ON TABLE public.brand_aliases FROM PUBLIC;
  GRANT SELECT ON TABLE public.brand_aliases TO authenticated;
  GRANT ALL ON TABLE public.brand_aliases TO service_role;
END $$;

-- ── waitlist: already INSERT-only RLS in 20260512160100 — re-affirm ─────────────────────────
DO $$
BEGIN
  IF to_regclass('public.waitlist') IS NULL THEN
    RAISE NOTICE 'rls_hardening: skip waitlist — table public.waitlist does not exist';
    RETURN;
  END IF;

  ALTER TABLE public.waitlist ENABLE ROW LEVEL SECURITY;
  -- Policies: waitlist_anon_insert_email, waitlist_authenticated_insert_email (no public SELECT)
END $$;
