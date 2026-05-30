ALTER TABLE public.listing_cache
  ADD COLUMN IF NOT EXISTS relevance_score numeric(4, 3);

COMMENT ON COLUMN public.listing_cache.relevance_score IS '0–1 title match vs scan brand + item type from vision extraction';
