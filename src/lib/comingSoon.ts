/**
 * When true, unauthenticated visitors are redirected to `/waitlist` (auth routes stay open).
 * Set in `.env`: VITE_PUBLIC_COMING_SOON=true — default / unset leaves the public site unchanged.
 */
export function isComingSoonEnabled(): boolean {
  const v = import.meta.env.VITE_PUBLIC_COMING_SOON;
  return v === "true" || v === "1";
}
