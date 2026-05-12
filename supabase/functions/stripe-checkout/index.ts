/**
 * Creates Stripe Checkout sessions (subscriptions + one-off Drop In).
 * Sets `metadata[user_id]` and `client_reference_id` so `stripe-success` can bind sessions to the caller.
 * Edge secrets: STRIPE_SECRET_KEY
 */
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { browserPreflightResponse, corsHeadersForRequest, jsonResponse } from "../_shared/cors.ts";
import { pickBody } from "../_shared/sanitizeBody.ts";
import { withRequestLog, type RequestLogHandle } from "../_shared/requestLog.ts";

const STRIPE_CHECKOUT_KEYS = [
  "plan",
  "user_id",
  "user_email",
  "success_url",
  "cancel_url",
] as const;

/** Amounts in minor units (pence). Plan ids must match profiles.plan / stripe-success / frontend. */
const PLAN_CONFIG: Record<string, { amount: number; currency: string; name: string; mode: string; interval?: string }> = {
  drop_in: {
    amount: 300,
    currency: "gbp",
    name: "Drop In — 10 scans",
    mode: "payment",
  },
  scout: {
    amount: 999,
    currency: "gbp",
    name: "Scout — 75 scans/month",
    mode: "subscription",
    interval: "month",
  },
  trader: {
    amount: 1999,
    currency: "gbp",
    name: "Trader — Unlimited scans/month",
    mode: "subscription",
    interval: "month",
  },
  pro: {
    amount: 3499,
    currency: "gbp",
    name: "Pro — Unlimited + all features/month",
    mode: "subscription",
    interval: "month",
  },
};

serve(
  withRequestLog("stripe-checkout", async (req, log: RequestLogHandle) => {
    if (req.method === "OPTIONS") {
      return browserPreflightResponse(req);
    }

    const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");
    if (!stripeKey) {
      log.setDetail("STRIPE_SECRET_KEY missing");
      return jsonResponse(req, { error: "STRIPE_SECRET_KEY is not set in Supabase secrets" }, 503);
    }

    let raw: Record<string, unknown>;
    try {
      raw = (await req.json()) as Record<string, unknown>;
    } catch {
      return jsonResponse(req, { error: "Invalid JSON body" }, 400);
    }

    const body = pickBody(raw, STRIPE_CHECKOUT_KEYS);
    const plan = body.plan;
    const user_id = body.user_id;
    const user_email = body.user_email;
    const success_url = body.success_url;
    const cancel_url = body.cancel_url;

    if (typeof plan !== "string" || !plan.trim()) {
      return jsonResponse(req, { error: "plan is required" }, 400);
    }
    if (typeof user_id !== "string" || !user_id.trim()) {
      return jsonResponse(req, { error: "user_id is required" }, 400);
    }
    if (typeof success_url !== "string" || !success_url.trim()) {
      return jsonResponse(req, { error: "success_url is required" }, 400);
    }
    if (typeof cancel_url !== "string" || !cancel_url.trim()) {
      return jsonResponse(req, { error: "cancel_url is required" }, 400);
    }
    if (user_email !== undefined && user_email !== null && typeof user_email !== "string") {
      return jsonResponse(req, { error: "user_email must be a string" }, 400);
    }

    log.setUser(user_id);

    const planConfig = PLAN_CONFIG[plan as string];
    if (!planConfig) {
      return jsonResponse(req, { error: `Unknown plan: ${plan}` }, 400);
    }

    const params = new URLSearchParams();
    params.append("mode", planConfig.mode);
    params.append("customer_email", (user_email as string) ?? "");
    params.append("client_reference_id", user_id);
    params.append("success_url", success_url as string);
    params.append("cancel_url", cancel_url as string);
    params.append("metadata[user_id]", user_id);
    params.append("metadata[plan]", plan);

    params.append("line_items[0][quantity]", "1");
    params.append("line_items[0][price_data][currency]", planConfig.currency);
    params.append("line_items[0][price_data][product_data][name]", planConfig.name);
    params.append("line_items[0][price_data][unit_amount]", String(planConfig.amount));

    if (planConfig.mode === "subscription" && planConfig.interval) {
      params.append("line_items[0][price_data][recurring][interval]", planConfig.interval);
    }

    const response = await fetch("https://api.stripe.com/v1/checkout/sessions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${stripeKey}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: params.toString(),
    });

    const session = await response.json() as { url?: string; error?: { message?: string } };

    if (!response.ok) {
      log.setDetail("stripe_create_session_failed");
      return jsonResponse(
        req,
        { error: session?.error?.message ?? `Stripe error ${response.status}` },
        400,
      );
    }

    return new Response(JSON.stringify({ url: session.url }), {
      status: 200,
      headers: { ...corsHeadersForRequest(req), "Content-Type": "application/json" },
    });
  }),
);
