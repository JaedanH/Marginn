/**
 * Auth gate: only allowlisted emails may sign in / sign up / reset password.
 *
 * Default (when env is unset): only `DEFAULT_OWNER_EMAIL` below.
 * Override in `.env` (comma-separated, case-insensitive):
 *   VITE_AUTH_ALLOWLIST_EMAILS=you@example.com,other@example.com
 *
 * To turn the allowlist OFF (open auth again), set:
 *   VITE_AUTH_ALLOWLIST_OFF=true
 *
 * NOTE: Vite exposes `VITE_*` to the client bundle. For a hard lock also disable
 * public sign-ups in Supabase Dashboard → Authentication, and remove extra users.
 */

/** Only this address may access the app unless `VITE_AUTH_ALLOWLIST_EMAILS` overrides. */
const DEFAULT_OWNER_EMAIL = "jaedanhug@gmail.com";

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function getAuthAllowlistEmails(): string[] | null {
  const off = import.meta.env.VITE_AUTH_ALLOWLIST_OFF as string | undefined;
  if (off === "true" || off === "1") return null;

  const raw = import.meta.env.VITE_AUTH_ALLOWLIST_EMAILS as string | undefined;
  if (raw?.trim()) {
    const parts = raw
      .split(",")
      .map((e) => normalizeEmail(e))
      .filter(Boolean);
    if (parts.length > 0) return parts;
  }

  return [normalizeEmail(DEFAULT_OWNER_EMAIL)];
}

export function isAuthAllowlistActive(): boolean {
  return getAuthAllowlistEmails() !== null;
}

export function isEmailAllowlisted(email: string): boolean {
  const list = getAuthAllowlistEmails();
  if (!list) return true;
  return list.includes(normalizeEmail(email));
}

export const AUTH_ALLOWLIST_REJECT_MESSAGE =
  "Sign-in is limited to approved accounts. Contact the team if you need access.";
