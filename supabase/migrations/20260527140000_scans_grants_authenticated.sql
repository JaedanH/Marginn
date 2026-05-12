-- Repair: ensure authenticated role can persist scans from the SPA (RLS still applies).
-- Some environments only had partial GRANTs after manual dashboard DDL.

GRANT SELECT, INSERT, UPDATE, DELETE ON public.scans TO authenticated;
