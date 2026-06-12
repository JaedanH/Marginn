/**
 * Haiku listing match scores for client findBestComparables (keeps ANTHROPIC_API_KEY server-side).
 */
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { browserPreflightResponse, corsHeadersForRequest } from "./_shared/cors.ts";
import { anthropicKey } from "./_shared/edgeSecrets.ts";

const HAIKU_MODEL = "claude-haiku-4-5-20251001";
const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";
const TIMEOUT_MS = 4500;

type ScoredListingInput = {
  title: string;
  price: number;
  platform: string;
  dateListed?: string;
};

type ScannedItemInput = {
  brand: string;
  itemType: string;
  colour: string;
  condition: string;
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return browserPreflightResponse(req);
  }

  const corsHeaders = corsHeadersForRequest(req);

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: userData, error: userErr } = await userClient.auth.getUser();
  if (userErr || !userData.user) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  let body: { scannedItem?: ScannedItemInput; listings?: ScoredListingInput[] };
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const scannedItem = body.scannedItem;
  const listings = body.listings;
  if (!scannedItem?.brand?.trim() || !scannedItem?.itemType?.trim()) {
    return new Response(JSON.stringify({ error: "Missing scannedItem brand or itemType" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  if (!Array.isArray(listings) || listings.length === 0) {
    return new Response(JSON.stringify({ scores: [] }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const listingLines = listings.map((l, i) =>
    `${i}. [${l.platform}] £${l.price} — "${l.title}" listed ${l.dateListed ?? "unknown"}`
  ).join("\n");

  const prompt = `You score resale listing relevance for a scanned second-hand item.

Scanned item:
- Brand: ${scannedItem.brand}
- Type: ${scannedItem.itemType}
- Colour: ${scannedItem.colour || "unknown"}
- Condition: ${scannedItem.condition || "unknown"}

Score each listing 0-100 using:
- Brand match: exact 100, close variation 70-90, different 0
- Item type: same 100, related 50, different 0
- Condition: same 100, one level off 70, two levels 30
- Colour: exact 100, similar 70, different 30
- Recency (from dateListed): within 30 days 100, 31-60 days 80, 61-90 days 60, over 90 days 30

Listings:
${listingLines}

Return ONLY a JSON array of ${listings.length} integers 0-100 in the same order. No markdown.`;

  try {
    const apiKey = anthropicKey();
    const res = await fetch(ANTHROPIC_URL, {
      method: "POST",
      signal: AbortSignal.timeout(TIMEOUT_MS),
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: HAIKU_MODEL,
        max_tokens: 1024,
        messages: [{ role: "user", content: prompt }],
      }),
    });

    const json = await res.json() as Record<string, unknown>;
    if (!res.ok) {
      console.error("[score-comparables] anthropic error", res.status, JSON.stringify(json).slice(0, 300));
      return new Response(JSON.stringify({ error: "Haiku request failed" }), {
        status: 502,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const content = json.content;
    let text = "";
    if (Array.isArray(content)) {
      for (const block of content) {
        if (block && typeof block === "object" && (block as { type?: string }).type === "text") {
          text += String((block as { text?: string }).text ?? "");
        }
      }
    }
    text = text.trim();
    const arrMatch = text.match(/\[[\s\S]*\]/);
    if (!arrMatch) {
      return new Response(JSON.stringify({ error: "No JSON array in Haiku response" }), {
        status: 502,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const scores = JSON.parse(arrMatch[0]) as unknown[];
    if (!Array.isArray(scores) || scores.length !== listings.length) {
      return new Response(JSON.stringify({ error: "Score array length mismatch" }), {
        status: 502,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const normalized = scores.map((s) => {
      const n = typeof s === "number" ? s : Number(s);
      if (!Number.isFinite(n)) return 0;
      return Math.max(0, Math.min(100, Math.round(n)));
    });

    return new Response(JSON.stringify({ scores: normalized }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("[score-comparables]", e instanceof Error ? e.message : "unknown");
    return new Response(JSON.stringify({ error: "Score request failed" }), {
      status: 502,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
