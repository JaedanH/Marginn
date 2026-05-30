/**
 * Forensic clothing authentication via Claude vision.
 * Edge secrets: ANTHROPIC_API_KEY, SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY.
 */
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { AUTHENTICATE_ITEM_SYSTEM_PROMPT } from "../_shared/authenticatePrompt.ts";
import { browserPreflightResponse, corsHeadersForRequest, jsonResponse } from "../_shared/cors.ts";
import { validateScanImageInput } from "../_shared/imageValidation.ts";
import { withRequestLog, type RequestLogHandle } from "../_shared/requestLog.ts";

const ANTHROPIC_API_URL = "https://api.anthropic.com/v1/messages";
const MODEL = "claude-sonnet-4-20250514";

export interface AuthenticationResult {
  verdict: "AUTHENTIC" | "SUSPICIOUS" | "UNVERIFIABLE";
  confidence: number;
  evidence: string[];
  risk_flags: string[];
  authentication_notes: string;
  brand_confirmed: boolean;
  recommend_physical_check: boolean;
  recommend_physical_check_reason: string;
}

function anthropicKey(): string {
  const k = (Deno.env.get("ANTHROPIC_API_KEY") ?? "").trim();
  if (!k) throw new Error("ANTHROPIC_API_KEY missing");
  return k;
}

function parseAuthenticationJson(raw: string): AuthenticationResult {
  const cleaned = raw.replace(/```json\s*/gi, "").replace(/```\s*/g, "").trim();
  const parsed = JSON.parse(cleaned) as Record<string, unknown>;
  const verdictRaw = String(parsed.verdict ?? "UNVERIFIABLE").toUpperCase();
  const verdict: AuthenticationResult["verdict"] =
    verdictRaw === "AUTHENTIC" || verdictRaw === "SUSPICIOUS"
      ? verdictRaw
      : "UNVERIFIABLE";
  const confidence = Math.min(1, Math.max(0, Number(parsed.confidence) || 0));
  const evidence = Array.isArray(parsed.evidence)
    ? parsed.evidence.map((e) => String(e)).filter(Boolean).slice(0, 8)
    : [];
  const risk_flags = Array.isArray(parsed.risk_flags)
    ? parsed.risk_flags.map((e) => String(e)).filter(Boolean).slice(0, 8)
    : [];
  return {
    verdict,
    confidence,
    evidence,
    risk_flags,
    authentication_notes: String(parsed.authentication_notes ?? "").slice(0, 500),
    brand_confirmed: Boolean(parsed.brand_confirmed),
    recommend_physical_check: Boolean(parsed.recommend_physical_check),
    recommend_physical_check_reason: String(parsed.recommend_physical_check_reason ?? "").slice(0, 300),
  };
}

serve(
  withRequestLog("authenticate-item", async (req, log: RequestLogHandle) => {
    if (req.method === "OPTIONS") return browserPreflightResponse(req);
    if (req.method !== "POST") return jsonResponse(req, { error: "Method not allowed" }, 405);

    const supabaseUrl = (Deno.env.get("SUPABASE_URL") ?? "").trim();
    const anonKey = (Deno.env.get("SUPABASE_ANON_KEY") ?? "").trim();
    const serviceKey = (Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? Deno.env.get("SB_KEY") ?? "").trim();
    if (!supabaseUrl || !anonKey) {
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
    if (userErr || !user?.id) return jsonResponse(req, { error: "Invalid session" }, 401);
    log.setUser(user.id);

    let body: Record<string, unknown>;
    try {
      body = await req.json();
    } catch {
      return jsonResponse(req, { error: "Invalid JSON body" }, 400);
    }

    const imageRaw = (body.imageBase64 ?? body.image_base64) as string | undefined;
    const mimeRaw = (body.mimeType ?? body.image_type) as string | undefined;
    const brandName = String(body.brandName ?? body.brand_name ?? "").trim();
    const itemType = String(body.itemType ?? body.item_type ?? "").trim();
    const bodyUserId = String(body.userId ?? body.user_id ?? "").trim();
    const scanId = String(body.scanId ?? body.scan_id ?? "").trim();

    if (bodyUserId && bodyUserId !== user.id) {
      return jsonResponse(req, { error: "userId does not match session" }, 403);
    }

    if (!imageRaw) return jsonResponse(req, { error: "imageBase64 required" }, 400);
    if (!brandName) return jsonResponse(req, { error: "brandName required" }, 400);

    const validated = validateScanImageInput(imageRaw, mimeRaw);
    if ("error" in validated) return jsonResponse(req, { error: validated.error }, 400);

    const userText =
      `Brand to authenticate: ${brandName}\nItem type: ${itemType || "unknown"}\n\nReturn ONLY the JSON object specified in your instructions.`;

    const anthropicRes = await fetch(ANTHROPIC_API_URL, {
      method: "POST",
      headers: {
        "x-api-key": anthropicKey(),
        "anthropic-version": "2023-06-01",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 1024,
        system: AUTHENTICATE_ITEM_SYSTEM_PROMPT,
        messages: [
          {
            role: "user",
            content: [
              {
                type: "image",
                source: {
                  type: "base64",
                  media_type: validated.mimeType,
                  data: validated.cleanBase64,
                },
              },
              { type: "text", text: userText },
            ],
          },
        ],
      }),
    });

    if (!anthropicRes.ok) {
      const errText = await anthropicRes.text();
      console.error("[authenticate-item] Claude error:", anthropicRes.status, errText.slice(0, 300));
      return jsonResponse(req, { error: "Authentication analysis failed" }, 500);
    }

    const anthropicData = await anthropicRes.json();
    const rawText = anthropicData?.content?.[0]?.text ?? "";

    let authentication: AuthenticationResult;
    try {
      authentication = parseAuthenticationJson(rawText);
    } catch (e) {
      console.error("[authenticate-item] parse failed:", rawText.slice(0, 400));
      return jsonResponse(req, { error: "Failed to parse authentication response" }, 500);
    }

    const authentication_score = Math.round(authentication.confidence * 100);
    const authentication_verdict = authentication.verdict;

    if (scanId && serviceKey) {
      const admin = createClient(supabaseUrl, serviceKey, {
        auth: { autoRefreshToken: false, persistSession: false },
      });
      const { error: updErr } = await admin
        .from("scans")
        .update({
          authentication_result: authentication,
          authentication_score,
          authentication_verdict,
        } as never)
        .eq("id", scanId)
        .eq("user_id", user.id);
      if (updErr) {
        console.error("[authenticate-item] scans update failed:", updErr.message);
      }
    } else if (scanId && !serviceKey) {
      const { error: updErr } = await userClient
        .from("scans")
        .update({
          authentication_result: authentication,
          authentication_score,
          authentication_verdict,
        } as never)
        .eq("id", scanId)
        .eq("user_id", user.id);
      if (updErr) console.error("[authenticate-item] scans update (user client):", updErr.message);
    }

    return jsonResponse(req, {
      authentication,
      authentication_score,
      authentication_verdict,
      scan_id: scanId || null,
    }, 200);
  }),
);
