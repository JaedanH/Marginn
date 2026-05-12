/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_PUBLIC_SUPABASE_URL?: string;
  readonly VITE_PUBLIC_SUPABASE_ANON_KEY?: string;
  /** When "true" or "1", anonymous users are sent to `/waitlist` (see router gate). */
  readonly VITE_PUBLIC_COMING_SOON?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
