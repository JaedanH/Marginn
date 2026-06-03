-- Marginn — scans RLS policies + platform CHECK constraint (idempotent)
--
-- Context: investigating "scan results are not saving to Supabase".
--
-- Cause #2: ensure the three intended owner-scoped RLS policies exist on
-- public.scans. NOTE: `CREATE POLICY IF NOT EXISTS` is INVALID in Postgres,
-- so we use DROP POLICY IF EXISTS + CREATE POLICY to stay idempotent.
-- These policies already exist (scans_insert_own / scans_select_own /
-- scans_update_own); this migration re-asserts them as the canonical source
-- of truth and leaves the additional partner-shop policies untouched.
--
-- Cause #3: widen scans_platform_check. The user's requested set was
-- ('ebay','vinted','depop','unknown','combined'). However the analyse-item
-- Edge Function (the real save path) inserts platform = 'web', and the
-- column DEFAULT is 'all'. Restricting to only the requested five values
-- would REINTRODUCE insert failures, so we use the UNION that also keeps
-- 'web' and 'all'. The scans table currently has 0 rows, so no existing
-- data conflicts with the new constraint. A plain CHECK ... IN (...) still
-- permits NULL (platform is nullable), which is acceptable here.

BEGIN;

-- Ensure RLS is on (it already is; this is a safe no-op if enabled).
ALTER TABLE public.scans ENABLE ROW LEVEL SECURITY;

-- --- Cause #2: owner-scoped policies for the authenticated role ----------

DROP POLICY IF EXISTS "scans_insert_own" ON public.scans;
CREATE POLICY "scans_insert_own"
  ON public.scans
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "scans_select_own" ON public.scans;
CREATE POLICY "scans_select_own"
  ON public.scans
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "scans_update_own" ON public.scans;
CREATE POLICY "scans_update_own"
  ON public.scans
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- --- Cause #3: platform CHECK constraint (widened, non-breaking) ---------

ALTER TABLE public.scans DROP CONSTRAINT IF EXISTS scans_platform_check;
ALTER TABLE public.scans
  ADD CONSTRAINT scans_platform_check
  CHECK (platform IN ('ebay','vinted','depop','unknown','combined','web','all'));

COMMIT;
