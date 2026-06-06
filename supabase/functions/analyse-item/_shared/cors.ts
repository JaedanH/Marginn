/**
 * Browser CORS for SPA → Edge calls. Echo Access-Control-Allow-Origin only for allowlisted origins.
 * Do not use for Stripe webhooks (server-to-server; omit these headers there).
 *
 * Optional: set Edge secret `EDGE_EXTRA_ALLOWED_ORIGINS` to a comma-separated list
 * (e.g. your Readdy preview URL) so the SPA can call functions from that host.
 */

export const BROWSER_ALLOWED_ORIGINS = [
  "https://marginn.co.uk",
  "https://www.marginn.co.uk",
  "http://localhost:5173",
] as const;

export type BrowserAllowedOrigin = (typeof BROWSER_ALLOWED_ORIGINS)[number];

function buildAllowedOriginSet(): Set<string> {
  const set = new Set<string>(BROWSER_ALLOWED_ORIGINS);
  const extra = (typeof Deno !== "undefined" ? Deno.env.get("EDGE_EXTRA_ALLOWED_ORIGINS") : undefined) ??
    "";
  for (const part of extra.split(",")) {
    const o = part.trim();
    if (o) set.add(o);
  }
  return set;
}

const ALLOWED_SET = buildAllowedOriginSet();

/** Readdy preview/publish hosts (editor + live sites not on marginn.co.uk yet). */
function isReaddyBrowserOrigin(hostname: string): boolean {
  const h = hostname.toLowerCase();
  return (
    h === "readdy.ai" ||
    h.endsWith(".readdy.ai") ||
    h === "readdy.app" ||
    h.endsWith(".readdy.app") ||
    h.endsWith(".readdy.dev")
  );
}

/** Vercel production + preview deployments (marginn-dev, branch previews). */
function isVercelBrowserOrigin(hostname: string): boolean {
  const h = hostname.toLowerCase();
  return h === "vercel.app" || h.endsWith(".vercel.app");
}

export function resolveAllowedBrowserOrigin(originHeader: string | null | undefined): string | null {
  const o = originHeader?.trim() ?? "";
  if (!o) return null;
  if (ALLOWED_SET.has(o)) return o;
  try {
    const host = new URL(o).hostname;
    if (isReaddyBrowserOrigin(host) || isVercelBrowserOrigin(host)) return o;
  } catch {
    /* ignore malformed Origin */
  }
  return null;
}

const BASE_CORS: Record<string, string> = {
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Max-Age": "86400",
};

/** CORS headers for a browser request; omits ACAO when Origin is missing or not allowlisted. */
export function corsHeadersForRequest(req: Request): Record<string, string> {
  const origin = req.headers.get("Origin") ?? req.headers.get("origin");
  const allowed = resolveAllowedBrowserOrigin(origin);
  if (!allowed) {
    return { ...BASE_CORS };
  }
  return {
    ...BASE_CORS,
    "Access-Control-Allow-Origin": allowed,
    Vary: "Origin",
  };
}

export function browserPreflightResponse(req: Request): Response {
  return new Response(null, {
    status: 204,
    headers: corsHeadersForRequest(req),
  });
}

export function jsonResponse(
  req: Request,
  body: unknown,
  status: number,
  extraHeaders?: HeadersInit,
): Response {
  const headers = new Headers({ "Content-Type": "application/json", ...corsHeadersForRequest(req) });
  if (extraHeaders) {
    new Headers(extraHeaders).forEach((v, k) => headers.set(k, v));
  }
  return new Response(JSON.stringify(body), { status, headers });
}
