import { supabase } from '../supabaseClient';

/**
 * Return the user id that matches the JWT Supabase-js sends to PostgREST.
 *
 * Prefer `getSession()` (persisted session) over React context: context can lag or briefly
 * disagree after refresh/navigation, while `.eq('user_id', …)` combined with RLS
 * (`auth.uid() = user_id`) would then return no rows — empty scan history / dashboard.
 *
 * Falls back to `preferredUserId` when session is not yet readable, then `getUser()`.
 */
export async function resolveAuthUserId(preferredUserId?: string | null): Promise<string | null> {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  const sessionUserId = session?.user?.id ?? null;
  if (sessionUserId) {
    if (preferredUserId && preferredUserId !== sessionUserId) {
      console.warn('[resolveAuthUserId] context id does not match session; using session id');
    }
    return sessionUserId;
  }
  if (preferredUserId) return preferredUserId;
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();
  if (error) console.warn('[resolveAuthUserId] getUser failed:', error.message);
  return user?.id ?? null;
}
