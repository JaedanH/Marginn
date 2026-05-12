-- Profiles: monthly scan reset anchor + referral code; auto-create profile on signup.
-- Referrals: optional columns used by the app (safe IF NOT EXISTS).

-- ── profiles columns ──────────────────────────────────────────────────────────
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS scans_reset_date date;

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS referral_code text;

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS full_name text;

-- Backfill referral_code for existing rows (matches app: first 8 hex chars of UUID, uppercased)
UPDATE public.profiles p
SET referral_code = upper(substring(replace(p.id::text, '-', ''), 1, 8))
WHERE referral_code IS NULL OR trim(referral_code) = '';

-- Default scans_reset_date to start of next UTC month
UPDATE public.profiles p
SET scans_reset_date = (date_trunc('month', timezone('utc', now())) + interval '1 month')::date
WHERE scans_reset_date IS NULL;

-- ── referrals: align with app inserts / selects ─────────────────────────────
DO $$
BEGIN
  IF to_regclass('public.referrals') IS NOT NULL THEN
    ALTER TABLE public.referrals ADD COLUMN IF NOT EXISTS referrer_user_id uuid;
    ALTER TABLE public.referrals ADD COLUMN IF NOT EXISTS referred_user_id uuid;
    ALTER TABLE public.referrals ADD COLUMN IF NOT EXISTS referral_code text;
    ALTER TABLE public.referrals ADD COLUMN IF NOT EXISTS status text DEFAULT 'pending';
    ALTER TABLE public.referrals ADD COLUMN IF NOT EXISTS date_referred timestamptz;
    ALTER TABLE public.referrals ADD COLUMN IF NOT EXISTS referred_email text;
    ALTER TABLE public.referrals ADD COLUMN IF NOT EXISTS reward_granted boolean DEFAULT false;
  END IF;
END $$;

-- Copy legacy referrer_id into referrer_user_id when both exist
DO $$
BEGIN
  IF to_regclass('public.referrals') IS NULL THEN
    RETURN;
  END IF;
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'referrals' AND column_name = 'referrer_id'
  ) AND EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'referrals' AND column_name = 'referrer_user_id'
  ) THEN
    UPDATE public.referrals SET referrer_user_id = referrer_id WHERE referrer_user_id IS NULL AND referrer_id IS NOT NULL;
  END IF;
END $$;

-- ── Auto-create profile when a new auth user is inserted ─────────────────────
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  next_reset date;
  ref_code text;
BEGIN
  next_reset := (date_trunc('month', timezone('utc', now())) + interval '1 month')::date;
  ref_code := upper(substring(replace(new.id::text, '-', ''), 1, 8));

  INSERT INTO public.profiles (id, email, plan, scans_limit, scans_used_this_month, referral_code, scans_reset_date, full_name)
  VALUES (
    new.id,
    coalesce(new.email, ''),
    'free',
    5,
    0,
    ref_code,
    next_reset,
    coalesce(new.raw_user_meta_data->>'full_name', null)
  )
  ON CONFLICT (id) DO UPDATE SET
    email = coalesce(nullif(excluded.email, ''), profiles.email),
    referral_code = coalesce(nullif(profiles.referral_code, ''), excluded.referral_code),
    scans_reset_date = coalesce(profiles.scans_reset_date, excluded.scans_reset_date);

  RETURN new;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE PROCEDURE public.handle_new_user();
