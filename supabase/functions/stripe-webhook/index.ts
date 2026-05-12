/**
 * Stripe webhook — verify signature with STRIPE_WEBHOOK_SECRET; updates profiles on checkout.session.completed.
 * Edge secrets: STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 *
 * Server-to-server only: no browser CORS headers (Stripe does not require them).
 */
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@14.25.0?target=deno";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { applyPaidCheckoutFromSession } from "../_shared/stripeCheckoutApply.ts";
import { withRequestLog, type RequestLogHandle } from "../_shared/requestLog.ts";

const JSON_HEADERS = { "Content-Type": "application/json" };

serve(
  withRequestLog("stripe-webhook", async (req, log: RequestLogHandle) => {
    if (req.method === "OPTIONS") {
      return new Response(null, { status: 204 });
    }

    if (req.method !== "POST") {
      return new Response(JSON.stringify({ error: "Method not allowed" }), {
        status: 405,
        headers: JSON_HEADERS,
      });
    }

    const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");
    const whSecret = Deno.env.get("STRIPE_WEBHOOK_SECRET");
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!stripeKey || !whSecret) {
      log.setDetail("stripe webhook secrets missing");
      return new Response(JSON.stringify({ error: "Stripe webhook is not configured" }), {
        status: 503,
        headers: JSON_HEADERS,
      });
    }
    if (!supabaseUrl || !supabaseServiceKey) {
      return new Response(JSON.stringify({ error: "Supabase is not configured" }), {
        status: 503,
        headers: JSON_HEADERS,
      });
    }

    const signature = req.headers.get("stripe-signature");
    if (!signature) {
      return new Response(JSON.stringify({ error: "Missing stripe-signature" }), {
        status: 400,
        headers: JSON_HEADERS,
      });
    }

    const rawBody = await req.text();

    const stripe = new Stripe(stripeKey, {
      apiVersion: "2023-10-16",
      httpClient: Stripe.createFetchHttpClient(),
    });

    let event: Stripe.Event;
    try {
      event = stripe.webhooks.constructEvent(rawBody, signature, whSecret);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Invalid payload";
      log.setDetail("signature_invalid");
      return new Response(JSON.stringify({ error: msg }), {
        status: 400,
        headers: JSON_HEADERS,
      });
    }

    log.setDetail(event.type);

    if (event.type === "checkout.session.completed") {
      const session = event.data.object as Stripe.Checkout.Session;
      const supabase = createClient(supabaseUrl, supabaseServiceKey);
      try {
        await applyPaidCheckoutFromSession(
          supabase,
          session as unknown as Record<string, unknown>,
        );
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : "Webhook handler error";
        log.setDetail("checkout_apply_failed");
        console.error("stripe-webhook checkout.session.completed:", msg);
        return new Response(JSON.stringify({ error: msg }), {
          status: 400,
          headers: JSON_HEADERS,
        });
      }
    }

    return new Response(JSON.stringify({ received: true }), {
      status: 200,
      headers: JSON_HEADERS,
    });
  }),
);
