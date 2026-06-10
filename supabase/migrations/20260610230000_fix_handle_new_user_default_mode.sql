-- Fix signup 500 "Database error saving new user":
-- the live handle_new_user inserted default_mode = 'basic', which violates
-- profiles_default_mode_check (allowed: SAFE / STANDARD / AGGRESSIVE).

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
    default_mode,
    role
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
    'STANDARD',
    'user'
  )
  ON CONFLICT (id) DO UPDATE SET
    email = coalesce(nullif(excluded.email, ''), profiles.email),
    referral_code = coalesce(nullif(profiles.referral_code, ''), excluded.referral_code),
    scans_reset_date = coalesce(profiles.scans_reset_date, excluded.scans_reset_date),
    onboarding_completed = coalesce(profiles.onboarding_completed, excluded.onboarding_completed),
    default_mode = coalesce(profiles.default_mode, excluded.default_mode),
    role = coalesce(profiles.role, excluded.role);

  RETURN new;
END;
$$;
