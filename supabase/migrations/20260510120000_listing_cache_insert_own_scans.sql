-- Allow users (JWT) to insert listing_cache rows tied to scans they own
DROP POLICY IF EXISTS "Users insert listing_cache for own scans" ON public.listing_cache;
CREATE POLICY "Users insert listing_cache for own scans"
ON public.listing_cache
FOR INSERT
TO public
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.scans s
    WHERE s.id = listing_cache.scan_id
      AND s.user_id = auth.uid()
  )
);
