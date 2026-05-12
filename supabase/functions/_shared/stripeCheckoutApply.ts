/**
 * Shared checkout → profile logic for stripe-success (client callback) and stripe-webhook.
 * Idempotent per checkout session via public.processed_stripe_sessions.
 */
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

function firstOfNextUtcMonth(): string {
  const d = new Date();
  const y = d.getUTCFullYear();
  const m = d.getUTCMonth();
  const next = new Date(Date.UTC(y, m + 1, 1));
  return next.toISOString().slice(0, 10);
}

function asRecord(v: unknown): Record<string, string> | null {
  if (!v || typeof v !== "object") return null;
  const o = v as Record<string, unknown>;
  const out: Record<string, string> = {};
  for (const [k, val] of Object.entries(o)) {
    if (typeof val === "string") out[k] = val;
  }
  return out;
}

/** Stripe Checkout Session object (subset). */
export async function applyPaidCheckoutFromSession(
  supabase: SupabaseClient,
  session: Record<string, unknown>,
): Promise<{ deduped: boolean }> {
  const paymentStatus = session.payment_status;
  const status = session.status;
  const isPaid = paymentStatus === "paid" || status === "complete";
  if (!isPaid) throw new Error("Payment not completed");

  const metadata = asRecord(session.metadata);
  const userId = metadata?.user_id;
  const plan = metadata?.plan;
  if (!userId || !plan) throw new Error("Missing user_id or plan in session metadata");

  const sessionId = typeof session.id === "string" ? session.id : "";
  if (!sessionId) throw new Error("Missing session id");

  const { error: claimErr } = await supabase
    .from("processed_stripe_sessions")
    .insert({ checkout_session_id: sessionId });

  if (claimErr?.code === "23505") {
    return { deduped: true };
  }
  if (claimErr) {
    throw new Error(`Session claim failed: ${claimErr.message}`);
  }

  try {
    const subscriptionRaw = session.subscription;
    const subscriptionId =
      typeof subscriptionRaw === "string"
        ? subscriptionRaw
        : (subscriptionRaw && typeof subscriptionRaw === "object" && "id" in subscriptionRaw &&
            typeof (subscriptionRaw as { id?: unknown }).id === "string")
        ? (subscriptionRaw as { id: string }).id
        : null;

    const customerRaw = session.customer;
    const customerId =
      typeof customerRaw === "string"
        ? customerRaw
        : (customerRaw && typeof customerRaw === "object" && "id" in customerRaw &&
            typeof (customerRaw as { id?: unknown }).id === "string")
        ? (customerRaw as { id: string }).id
        : null;

    let update: Record<string, unknown> = { plan };

    if (plan === "drop_in") {
      const { data: existing } = await supabase
        .from("profiles")
        .select("scans_limit")
        .eq("id", userId)
        .maybeSingle();

      update = {
        plan: "drop_in",
        scans_limit: (existing?.scans_limit ?? 0) + 10,
        stripe_subscription_id: null,
      };
      if (customerId) update.stripe_customer_id = customerId;
    } else if (plan === "scout") {
      update = {
        plan: "scout",
        scans_limit: 75,
        scans_used_this_month: 0,
        scans_reset_date: firstOfNextUtcMonth(),
        stripe_subscription_id: subscriptionId,
      };
      if (customerId) update.stripe_customer_id = customerId;
    } else if (plan === "trader" || plan === "pro") {
      update = {
        plan,
        scans_limit: 9999,
        scans_used_this_month: 0,
        stripe_subscription_id: subscriptionId,
      };
      if (customerId) update.stripe_customer_id = customerId;
    } else {
      throw new Error(`Unsupported plan: ${plan}`);
    }

    const { error: updateError } = await supabase
      .from("profiles")
      .update(update)
      .eq("id", userId);

    if (updateError) {
      throw new Error(`Profile update failed: ${updateError.message}`);
    }

    return { deduped: false };
  } catch (e) {
    await supabase.from("processed_stripe_sessions").delete().eq("checkout_session_id", sessionId);
    throw e;
  }
}
