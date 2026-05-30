-- Authentication + M-Score columns on scans

ALTER TABLE public.scans
  ADD COLUMN IF NOT EXISTS authentication_result jsonb,
  ADD COLUMN IF NOT EXISTS authentication_score numeric(5, 2),
  ADD COLUMN IF NOT EXISTS authentication_verdict text,
  ADD COLUMN IF NOT EXISTS m_score integer,
  ADD COLUMN IF NOT EXISTS m_score_breakdown jsonb;

COMMENT ON COLUMN public.scans.authentication_result IS 'Full Claude authentication payload (verdict, evidence, risk_flags, …)';
COMMENT ON COLUMN public.scans.authentication_score IS 'confidence × 100 from authentication_result';
COMMENT ON COLUMN public.scans.authentication_verdict IS 'AUTHENTIC | SUSPICIOUS | UNVERIFIABLE';
COMMENT ON COLUMN public.scans.m_score IS 'Marginn M-Score 0–100 (weighted market + margin)';
COMMENT ON COLUMN public.scans.m_score_breakdown IS 'M-Score breakdown, multipliers, signals for UI';
