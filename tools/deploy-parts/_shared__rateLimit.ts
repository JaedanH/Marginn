/**
 * Plan-based rolling 1-minute RPM for Edge functions (see migration `rate_limit_consume` RPC).
 * Requires SUPABASE_SERVICE_ROLE_KEY: RPC is executable by service_role only.
 */
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeadersForRequest } from "./cors.ts";

export const RATE_LIMIT_SLUG_ANALYSE_ITEM = "analyse-item";
export const RATE_LIMIT_SLUG_DELETE_ACCOUNT = "delete-account";

/** Requests per rolling 1-minute window; `pro` matches trader. Unknown plans → free. */
export function rpmForPlan(plan: string | null | undefined): number {
  const p = String(plan ?? "free").trim().toLowerCase();
  switch (p) {
    case "free":
      return 3;
    case "scout":
      return 10;
    case "trader":
    case "pro":
      return 60;
    case "drop_in":
    case "drop-in":
      return 5;
    default:
      return 3;
  }
}

export interface RateLimitRpcResult {
  allowed?: boolean;
  retry_after_sec?: number;
  error?: string;
}

/**
 * Resolves `profiles.plan` (default free), then atomically consumes one slot via RPC.
 * @returns `Response` (429 or 503) when blocked / misconfigured; `null` when the request may proceed.
 */
export async function enforceUserRateLimit(opts: {
  admin: SupabaseClient;
  userId: string;
  functionSlug: string;
  req: Request;
}): Promise<Response | null> {
  const { admin, userId, functionSlug, req } = opts;
  const corsHeaders = corsHeadersForRequest(req);

  const { data: prof, error: profErr } = await admin
    .from("profiles")
    .select("plan")
    .eq("id", userId)
    .maybeSingle();

  if (profErr) {
    console.warn("[rateLimit] profiles lookup:", profErr.message);
  }

  const plan = typeof prof?.plan === "string" ? prof.plan : null;
  const limit = rpmForPlan(plan);

  const { data, error } = await admin.rpc("rate_limit_consume", {
    p_user_id: userId,
    p_function_slug: functionSlug,
    p_limit: limit,
  });

  if (error) {
    console.error("[rateLimit] rate_limit_consume RPC:", error.message);
    return new Response(
      JSON.stringify({ error: "Rate limit check failed", detail: error.message }),
      {
        status: 503,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }

  const row = data as RateLimitRpcResult | null;
  if (row?.allowed === true) return null;

  const sec = Math.max(1, Math.ceil(Number(row?.retry_after_sec ?? 60)));
  const message = `Rate limit exceeded. Try again in ${sec} seconds.`;
  return new Response(JSON.stringify({ message }), {
    status: 429,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json",
      "Retry-After": String(sec),
    },
  });
}
