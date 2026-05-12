-- Partner charity shops: shops table, profile role + FK, scans.partner_shop_id, RLS.

-- ── partner_shops ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.partner_shops (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  name text NOT NULL DEFAULT 'Charity shop',
  created_at timestamptz NOT NULL DEFAULT timezone('utc', now())
);

CREATE INDEX IF NOT EXISTS partner_shops_owner_user_id_idx ON public.partner_shops (owner_user_id);

ALTER TABLE public.partner_shops ENABLE ROW LEVEL SECURITY;

GRANT SELECT ON public.partner_shops TO authenticated;
GRANT ALL ON public.partner_shops TO service_role;

DROP POLICY IF EXISTS "partner_shops_select_owner" ON public.partner_shops;
CREATE POLICY "partner_shops_select_owner"
  ON public.partner_shops
  FOR SELECT
  TO authenticated
  USING (owner_user_id = auth.uid());

-- ── profiles: role + optional linked shop ────────────────────────────────────
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS role text NOT NULL DEFAULT 'user';

ALTER TABLE public.profiles
  DROP CONSTRAINT IF EXISTS profiles_role_check;

ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_role_check CHECK (role IN ('user', 'partner'));

UPDATE public.profiles SET role = 'user' WHERE role IS NULL OR trim(role) = '';

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS partner_shop_id uuid REFERENCES public.partner_shops (id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS profiles_partner_shop_id_idx ON public.profiles (partner_shop_id) WHERE partner_shop_id IS NOT NULL;

-- Partners must have role partner if partner_shop_id is set (data hygiene)
ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_partner_shop_requires_role;
ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_partner_shop_requires_role CHECK (
    partner_shop_id IS NULL OR role = 'partner'
  );

-- ── scans: optional shop attribution ─────────────────────────────────────────
ALTER TABLE public.scans
  ADD COLUMN IF NOT EXISTS partner_shop_id uuid REFERENCES public.partner_shops (id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS scans_partner_shop_id_idx ON public.scans (partner_shop_id) WHERE partner_shop_id IS NOT NULL;

-- ── RLS: own rows OR scans attributed to partner's shop ───────────────────────
DROP POLICY IF EXISTS "scans_select_own" ON public.scans;
DROP POLICY IF EXISTS "scans_insert_own" ON public.scans;

CREATE POLICY "scans_select_own_or_partner_shop"
  ON public.scans
  FOR SELECT
  TO authenticated
  USING (
    auth.uid() = user_id
    OR EXISTS (
      SELECT 1
      FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.role = 'partner'
        AND p.partner_shop_id IS NOT NULL
        AND p.partner_shop_id = scans.partner_shop_id
    )
  );

CREATE POLICY "scans_insert_own_optional_partner_shop"
  ON public.scans
  FOR INSERT
  TO authenticated
  WITH CHECK (
    auth.uid() = user_id
    AND (
      partner_shop_id IS NULL
      OR EXISTS (
        SELECT 1
        FROM public.profiles p
        WHERE p.id = auth.uid()
          AND p.role = 'partner'
          AND p.partner_shop_id IS NOT NULL
          AND p.partner_shop_id = scans.partner_shop_id
      )
    )
  );
