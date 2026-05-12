/**
 * Receives Supabase Database Webhook payloads (or pg_net forwards). Validates `X-Webhook-Secret`.
 * Does not log raw bodies beyond event/table identifiers; optional minimal forward to Slack-compatible URL.
 * Edge secret: DB_WEBHOOK_SECRET (required). Optional: ALERT_WEBHOOK_FORWARD_URL (POST JSON { event, table } only).
 *
 * No browser CORS: invoked server-to-server only.
 */
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { withRequestLog, type RequestLogHandle } from "../_shared/requestLog.ts";

const JSON_HEADERS = { "Content-Type": "application/json" };

function safeMeta(payload: unknown): { kind: string; table?: string } {
  if (!payload || typeof payload !== "object") return { kind: "unknown" };
  const o = payload as Record<string, unknown>;
  const t = typeof o.type === "string" ? o.type : "";
  const tbl = typeof o.table === "string" ? o.table : undefined;
  if (t || tbl) return { kind: t || "record", table: tbl };
  return { kind: "object" };
}

serve(
  withRequestLog("db-webhook-receiver", async (req, log: RequestLogHandle) => {
    if (req.method === "OPTIONS") {
      return new Response(null, { status: 204 });
    }

    if (req.method !== "POST") {
      return new Response(JSON.stringify({ error: "Method not allowed" }), {
        status: 405,
        headers: JSON_HEADERS,
      });
    }

    const expected = (Deno.env.get("DB_WEBHOOK_SECRET") ?? "").trim();
    if (!expected) {
      log.setDetail("DB_WEBHOOK_SECRET missing");
      return new Response(JSON.stringify({ error: "Server not configured" }), {
        status: 503,
        headers: JSON_HEADERS,
      });
    }

    const hdr = (req.headers.get("X-Webhook-Secret") ?? req.headers.get("x-webhook-secret") ?? "").trim();
    if (hdr !== expected) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: JSON_HEADERS,
      });
    }

    let payload: unknown;
    try {
      payload = await req.json();
    } catch {
      return new Response(JSON.stringify({ error: "Invalid JSON" }), {
        status: 400,
        headers: JSON_HEADERS,
      });
    }

    const meta = safeMeta(payload);
    log.setDetail(`${meta.kind}${meta.table ? `:${meta.table}` : ""}`);

    const forward = (Deno.env.get("ALERT_WEBHOOK_FORWARD_URL") ?? "").trim();
    if (forward) {
      try {
        await fetch(forward, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            source: "marginn-db-webhook-receiver",
            type: meta.kind,
            table: meta.table ?? null,
          }),
        });
      } catch (e) {
        const m = e instanceof Error ? e.message : String(e);
        log.setDetail(`forward_err:${m.slice(0, 40)}`);
      }
    }

    return new Response(JSON.stringify({ ok: true, received: meta.kind }), {
      status: 200,
      headers: JSON_HEADERS,
    });
  }),
);
