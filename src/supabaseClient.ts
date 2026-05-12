import { createClient, type Session } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_PUBLIC_SUPABASE_URL as string;
const supabaseAnonKey = import.meta.env.VITE_PUBLIC_SUPABASE_ANON_KEY as string;

export const supabase = createClient(supabaseUrl, supabaseAnonKey)

/**
 * Headers for `fetch` to Edge Functions. Supabase expects:
 * - `apikey`: project anon (publishable) key
 * - `Authorization`: `Bearer <user access_token>` when signed in
 * See https://supabase.com/docs/guides/functions/auth
 *
 * Pass `session` from `useAuth()` when available so the token is never missing during a scan
 * before `getSession()` finishes hydrating from storage.
 */
export async function edgeFunctionAuthHeaders(opts?: {
  session?: Session | null
}): Promise<Record<string, string>> {
  const session =
    opts?.session !== undefined
      ? opts.session
      : (await supabase.auth.getSession()).data.session ?? null
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    apikey: supabaseAnonKey,
  }
  if (session?.access_token) {
    headers.Authorization = `Bearer ${session.access_token}`
  }
  return headers
}
