-- Data-backed flip score from Edge `calculateFlipScore` (not Claude trend_score).
ALTER TABLE public.scans
  ADD COLUMN IF NOT EXISTS flip_score numeric(4, 1),
  ADD COLUMN IF NOT EXISTS flip_score_breakdown jsonb;

COMMENT ON COLUMN public.scans.flip_score IS '0–10.1 weighted market + margin score after condition/seasonal modifiers';
COMMENT ON COLUMN public.scans.flip_score_breakdown IS 'Per-signal 0–10 subscores, weights, modifiers, sold_velocity meta for UI';
