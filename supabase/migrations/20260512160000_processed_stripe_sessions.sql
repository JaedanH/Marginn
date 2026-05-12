-- Idempotent Stripe Checkout handling (stripe-success + stripe-webhook).
-- Only the service role (Edge Functions) should touch this table.

CREATE TABLE IF NOT EXISTS public.processed_stripe_sessions (
  checkout_session_id TEXT PRIMARY KEY,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.processed_stripe_sessions ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.processed_stripe_sessions FROM PUBLIC;
