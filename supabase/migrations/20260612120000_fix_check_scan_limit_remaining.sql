-- Align check_scan_limit with app quota model: profiles.scans_limit is REMAINING scans
-- (decremented by the client via AuthContext.decrementScan), not a monthly cap.
-- The old trigger compared scans_used >= scans_limit and also incremented scans_used,
-- double-counting with the client and blocking inserts once scans_limit hit 0.

CREATE OR REPLACE FUNCTION public.check_scan_limit()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
DECLARE
  user_profile profiles%ROWTYPE;
BEGIN
  SELECT * INTO user_profile
  FROM profiles
  WHERE id = NEW.user_id;

  -- Unlimited plans
  IF user_profile.plan IN ('trader', 'pro') THEN
    RETURN NEW;
  END IF;

  -- Drop-in token plans
  IF user_profile.plan = 'drop_in' THEN
    IF COALESCE(user_profile.token_balance, 0) < 1 THEN
      RAISE EXCEPTION 'Insufficient token balance';
    END IF;
    UPDATE profiles
    SET token_balance = token_balance - 1
    WHERE id = NEW.user_id;
    RETURN NEW;
  END IF;

  -- Free, scout, and other limited plans: scans_limit is remaining balance
  IF COALESCE(user_profile.scans_limit, 0) <= 0 THEN
    RAISE EXCEPTION 'Scan limit reached';
  END IF;

  -- Quota accounting (scans_limit--, scans_used++) is handled by the client after a successful scan.
  RETURN NEW;
END;
$function$;
