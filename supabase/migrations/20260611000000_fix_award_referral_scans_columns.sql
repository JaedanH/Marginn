-- Fix scan saves failing with: column "referrer" does not exist.
-- The live award_referral_scans trigger (AFTER INSERT ON scans) referenced
-- referrals.referrer / referrals.referred, but the table's actual columns are
-- referrer_user_id / referred_user_id — making EVERY scans insert fail.

CREATE OR REPLACE FUNCTION public.award_referral_scans()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_referrer_id uuid;
BEGIN
  SELECT referrer_user_id INTO v_referrer_id
  FROM public.referrals
  WHERE referred_user_id = NEW.user_id
    AND status = 'pending'
  LIMIT 1;

  IF v_referrer_id IS NOT NULL THEN
    UPDATE public.profiles
    SET scans_limit = scans_limit + 5
    WHERE id = v_referrer_id;

    UPDATE public.referrals
    SET status = 'complete',
        scans_awarded = true
    WHERE referred_user_id = NEW.user_id
      AND status = 'pending';
  END IF;

  RETURN NEW;
END;
$$;
