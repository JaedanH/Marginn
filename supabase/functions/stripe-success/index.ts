/**
 * Client redirect callback: loads Checkout Session from Stripe and applies plan / scan limits (idempotent).
 * Production: also configure Stripe webhook → stripe-webhook (checkout.session.completed) so renewals and
 * delayed events are trusted without relying on the browser.
 * Edge secrets: STRIPE_SECRET_KEY, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 */
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { applyPaidCheckoutFromSession } from "../_shared/stripeCheckoutApply.ts";
import { browserPreflightResponse, corsHeadersForRequest, jsonResponse } from "../_shared/cors.ts";
import { pickBody } from "../_shared/sanitizeBody.ts";

const STRIPE_SUCCESS_KEYS = ["session_id"] as const;

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return browserPreflightResponse(req);
  }

  try {
    const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!stripeKey) throw new Error("STRIPE_SECRET_KEY is not configured");
    if (!supabaseUrl || !supabaseServiceKey) throw new Error("Supabase not configured");

    let raw: Record<string, unknown>;
    try {
      raw = (await req.json()) as Record<string, unknown>;
    } catch {
      return jsonResponse(req, { error: "Invalid JSON body" }, 400);
    }
    const body = pickBody(raw, STRIPE_SUCCESS_KEYS);
    const session_id = body.session_id;
    if (typeof session_id !== "string" || !session_id.trim()) {
      throw new Error("Missing session_id");
    }

    const sessionRes = await fetch(
      `https://api.stripe.com/v1/checkout/sessions/${session_id}`,
      { headers: { Authorization: `Bearer ${stripeKey}` } },
    );
    const session = await sessionRes.json();

    if (!sessionRes.ok) {
      throw new Error(session?.error?.message ?? "Could not retrieve Stripe session");
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    const { deduped } = await applyPaidCheckoutFromSession(supabase, session);

    const userId = session.metadata?.user_id;
    const plan = session.metadata?.plan;

    return new Response(
      JSON.stringify({ success: true, plan, user_id: userId, deduped }),
      { status: 200, headers: { ...corsHeadersForRequest(req), "Content-Type": "application/json" } },
    );
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    return jsonResponse(req, { error: msg }, 400);
  }
});
