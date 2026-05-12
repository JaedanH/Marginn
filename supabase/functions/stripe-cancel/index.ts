/**
 * Cancels a Stripe subscription at period end.
 * Edge secrets: STRIPE_SECRET_KEY
 */
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { withRequestLog, type RequestLogHandle } from "../_shared/requestLog.ts";
import { browserPreflightResponse, corsHeadersForRequest, jsonResponse } from "../_shared/cors.ts";
import { pickBody } from "../_shared/sanitizeBody.ts";

const STRIPE_CANCEL_KEYS = ["subscription_id"] as const;

serve(
  withRequestLog("stripe-cancel", async (req, log: RequestLogHandle) => {
    if (req.method === "OPTIONS") {
      return browserPreflightResponse(req);
    }

    const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");
    if (!stripeKey) {
      log.setDetail("STRIPE_SECRET_KEY missing");
      return jsonResponse(req, { error: "STRIPE_SECRET_KEY is not configured" }, 503);
    }

    let raw: Record<string, unknown>;
    try {
      raw = (await req.json()) as Record<string, unknown>;
    } catch {
      return jsonResponse(req, { error: "Invalid JSON body" }, 400);
    }

    const body = pickBody(raw, STRIPE_CANCEL_KEYS);
    const subscription_id = body.subscription_id;

    if (typeof subscription_id !== "string" || !subscription_id.trim()) {
      return jsonResponse(req, { error: "Missing subscription_id" }, 400);
    }

    const stripeRes = await fetch(`https://api.stripe.com/v1/subscriptions/${subscription_id}`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${stripeKey}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        "cancel_at_period_end": "true",
      }),
    });

    if (!stripeRes.ok) {
      const errData = await stripeRes.json() as { error?: { message?: string; type?: string } };
      const stripeMsg = errData?.error?.message;
      log.setDetail(errData?.error?.type ?? "stripe_error");
      console.error("Stripe cancel error:", stripeRes.status, stripeMsg ?? "no message");
      return jsonResponse(
        req,
        { error: stripeMsg || "Failed to cancel subscription" },
        400,
      );
    }

    const subscription = await stripeRes.json() as {
      id: string;
      status: string;
      cancel_at_period_end: boolean;
      current_period_end: number;
    };

    return new Response(
      JSON.stringify({
        success: true,
        subscription: {
          id: subscription.id,
          status: subscription.status,
          cancel_at_period_end: subscription.cancel_at_period_end,
          current_period_end: subscription.current_period_end,
        },
      }),
      { status: 200, headers: { ...corsHeadersForRequest(req), "Content-Type": "application/json" } },
    );
  }),
);
