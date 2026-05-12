-- Waitlist: public email capture (anon insert only; no public reads).

CREATE TABLE IF NOT EXISTS public.waitlist (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT waitlist_email_unique UNIQUE (email)
);

CREATE INDEX IF NOT EXISTS idx_waitlist_created_at ON public.waitlist (created_at DESC);

ALTER TABLE public.waitlist ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.waitlist FROM PUBLIC;
GRANT INSERT ON TABLE public.waitlist TO anon, authenticated;

CREATE POLICY "waitlist_anon_insert_email"
  ON public.waitlist
  FOR INSERT
  TO anon
  WITH CHECK (length(trim(email)) > 0);

CREATE POLICY "waitlist_authenticated_insert_email"
  ON public.waitlist
  FOR INSERT
  TO authenticated
  WITH CHECK (length(trim(email)) > 0);
