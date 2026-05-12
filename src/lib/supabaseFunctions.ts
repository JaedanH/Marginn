/** Base Supabase project URL (same as `VITE_PUBLIC_SUPABASE_URL`, no trailing slash). */
export function supabaseProjectUrl(): string {
  const url = (import.meta.env.VITE_PUBLIC_SUPABASE_URL as string | undefined)?.trim();
  if (!url) {
    throw new Error(
      "VITE_PUBLIC_SUPABASE_URL is missing. Add it to your .env (see .env.example).",
    );
  }
  return url.replace(/\/$/, "");
}

/** Edge Function invoke URL, e.g. `…/functions/v1/stripe-checkout`. */
export function supabaseFunctionUrl(slug: string): string {
  return `${supabaseProjectUrl()}/functions/v1/${slug}`;
}
