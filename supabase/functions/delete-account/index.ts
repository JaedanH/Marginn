/**
 * Deletes the authenticated user and related rows (service role).
 * Edge secrets: SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY (or SB_KEY).
 */
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { enforceUserRateLimit, RATE_LIMIT_SLUG_DELETE_ACCOUNT } from "../_shared/rateLimit.ts";
import { withRequestLog, type RequestLogHandle } from "../_shared/requestLog.ts";
import { browserPreflightResponse, corsHeadersForRequest, jsonResponse } from "../_shared/cors.ts";

function pgErr(e: unknown): { code?: string; message: string } {
  if (!e || typeof e !== "object") return { message: "error" };
  const o = e as Record<string, unknown>;
  return {
    code: typeof o.code === "string" ? o.code : undefined,
    message: typeof o.message === "string" ? o.message : "error",
  };
}

serve(
  withRequestLog("delete-account", async (req, log: RequestLogHandle) => {
    if (req.method === "OPTIONS") {
      return browserPreflightResponse(req);
    }
    if (req.method !== "POST") {
      return jsonResponse(req, { error: "Method not allowed" }, 405);
    }

    const supabaseUrl = (Deno.env.get("SUPABASE_URL") ?? "").trim();
    const serviceKey = (Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? Deno.env.get("SB_KEY") ?? "").trim();
    const anonKey = (Deno.env.get("SUPABASE_ANON_KEY") ?? "").trim();
    if (!supabaseUrl || !serviceKey || !anonKey) {
      log.setDetail("server misconfigured");
      return jsonResponse(req, { error: "Server misconfigured" }, 500);
    }

    const authHeader = (req.headers.get("Authorization") ?? req.headers.get("authorization") ?? "").trim();
    if (!authHeader.startsWith("Bearer ")) {
      return jsonResponse(req, { error: "Unauthorized" }, 401);
    }

    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: userErr } = await userClient.auth.getUser();
    if (userErr || !user?.id) {
      return jsonResponse(req, { error: "Invalid session" }, 401);
    }
    const uid = user.id;
    log.setUser(uid);

    const admin = createClient(supabaseUrl, serviceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const rateResp = await enforceUserRateLimit({
      admin,
      userId: uid,
      functionSlug: RATE_LIMIT_SLUG_DELETE_ACCOUNT,
      req,
    });
    if (rateResp) return rateResp;

    const { data: scans, error: scanSelErr } = await admin.from("scans").select("id").eq("user_id", uid);
    if (scanSelErr) console.error("[delete-account] scans select", pgErr(scanSelErr));

    const scanIds = (scans ?? []).map((r: { id: string }) => r.id);
    if (scanIds.length > 0) {
      const { error: lcErr } = await admin.from("listing_cache").delete().in("scan_id", scanIds);
      if (lcErr) console.error("[delete-account] listing_cache", pgErr(lcErr));
    }

    const { error: delScans } = await admin.from("scans").delete().eq("user_id", uid);
    if (delScans) console.error("[delete-account] scans", pgErr(delScans));

    const { error: savedErr } = await admin.from("saved_items").delete().eq("user_id", uid);
    if (savedErr) console.warn("[delete-account] saved_items (optional)", savedErr.message);

    const { error: profErr } = await admin.from("profiles").delete().eq("id", uid);
    if (profErr) console.error("[delete-account] profiles", pgErr(profErr));

    const { error: delAuthErr } = await admin.auth.admin.deleteUser(uid);
    if (delAuthErr) {
      log.setDetail("auth_delete_failed");
      return jsonResponse(req, { error: delAuthErr.message }, 500);
    }

    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { ...corsHeadersForRequest(req), "Content-Type": "application/json" },
    });
  }),
);
