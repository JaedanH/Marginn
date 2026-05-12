-- Onboarding gate (dashboard) + default scan mode for settings.
-- Existing users: treat onboarding as already completed.

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS onboarding_completed boolean NOT NULL DEFAULT false;

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS default_mode text NOT NULL DEFAULT 'STANDARD';

UPDATE public.profiles
SET onboarding_completed = true;

-- Keep new signups on onboarding until they finish (trigger insert omits column → default false).
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

  INSERT INTO public.profiles (
    id,
    email,
    plan,
    scans_limit,
    scans_used_this_month,
    referral_code,
    scans_reset_date,
    full_name,
    onboarding_completed,
    default_mode
  )
  VALUES (
    new.id,
    coalesce(new.email, ''),
    'free',
    5,
    0,
    ref_code,
    next_reset,
    coalesce(new.raw_user_meta_data->>'full_name', null),
    false,
    'STANDARD'
  )
  ON CONFLICT (id) DO UPDATE SET
    email = coalesce(nullif(excluded.email, ''), profiles.email),
    referral_code = coalesce(nullif(profiles.referral_code, ''), excluded.referral_code),
    scans_reset_date = coalesce(profiles.scans_reset_date, excluded.scans_reset_date);

  RETURN new;
END;
$$;
