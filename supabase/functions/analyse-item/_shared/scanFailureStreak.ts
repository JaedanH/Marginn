/**
 * Tracks repeated analyse-item failures per user (Edge + service role RPC).
 * Optional HTTP alert when streak crosses threshold (secrets via env only).
 */
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

function intEnv(name: string, fallback: number): number {
  const v = Number(Deno.env.get(name) ?? "");
  if (!Number.isFinite(v) || v < 1) return fallback;
  return Math.floor(v);
}

/** Record a server-side scan pipeline failure (5xx-class). No-op if admin client unavailable. */
export async function recordScanFailureStreak(
  admin: SupabaseClient,
  userId: string | null | undefined,
): Promise<void> {
  const uid = typeof userId === "string" && userId.length > 0 ? userId : null;
  if (!uid) return;

  const windowMin = intEnv("SCAN_FAILURE_WINDOW_MINUTES", 15);
  const threshold = intEnv("SCAN_FAILURE_ALERT_THRESHOLD", 5);
  const alertUrl = (Deno.env.get("SCAN_FAILURE_ALERT_URL") ?? "").trim();
  const alertSecret = (Deno.env.get("SCAN_FAILURE_ALERT_SECRET") ?? "").trim();

  const { data, error } = await admin.rpc("scan_failure_streak_record", {
    p_user_id: uid,
    p_window_minutes: windowMin,
  });

  if (error) {
    console.warn("scan_failure_streak_record:", error.message);
    return;
  }

  const row = data as { count?: number } | null;
  const count = typeof row?.count === "number" ? row.count : 0;
  if (count < threshold || !alertUrl) return;

  try {
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (alertSecret) headers["X-Webhook-Secret"] = alertSecret;
    await fetch(alertUrl, {
      method: "POST",
      headers,
      body: JSON.stringify({
        event: "scan_failure_streak",
        threshold,
        window_minutes: windowMin,
        failure_count: count,
      }),
    });
  } catch (e) {
    const m = e instanceof Error ? e.message : String(e);
    console.warn("SCAN_FAILURE_ALERT_URL notify failed:", m);
  }
}
