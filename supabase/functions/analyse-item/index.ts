/**
 * AI vision + marketplace scrape pipeline.
 * Edge secrets: ANTHROPIC_API_KEY, SCRAPINGBEE_KEY (or SCRAPINGBEE_API_KEY), SUPABASE_URL, SUPABASE_ANON_KEY,
 * SUPABASE_SERVICE_ROLE_KEY (required for `scan_identification_cache` + reliable `scans` insert + **plan RPM / `rate_limit_consume`**),
 * optional IMGBB_KEY / IMGBB_API_KEY. No third-party API keys belong in source.
 */
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  fingerprintFromScanBase64,
  IDENT_CACHE_SCHEMA_VERSION,
  IDENT_CACHE_TTL_MS,
  isIdentificationPayloadUsable,
  mergeIdentificationFromCache,
  pickIdentificationPayload,
} from "../_shared/identificationCache.ts";
import { browserPreflightResponse, corsHeadersForRequest, jsonResponse } from "../_shared/cors.ts";
import { pickBody } from "../_shared/sanitizeBody.ts";
import { validateScanImageInput } from "../_shared/imageValidation.ts";
import { enforceUserRateLimit, RATE_LIMIT_SLUG_ANALYSE_ITEM } from "../_shared/rateLimit.ts";
import { withRequestLog, type RequestLogHandle } from "../_shared/requestLog.ts";
import { recordScanFailureStreak } from "../_shared/scanFailureStreak.ts";

const ANTHROPIC_API_URL = "https://api.anthropic.com/v1/messages";

function anthropicKey(): string {
  const k = (Deno.env.get("ANTHROPIC_API_KEY") ?? "").trim();
  if (!k) throw new Error("ANTHROPIC_API_KEY missing — set it in Edge Function secrets");
  return k;
}

function scrapingBeeKey(): string {
  const k = (Deno.env.get("SCRAPINGBEE_KEY") ?? Deno.env.get("SCRAPINGBEE_API_KEY") ?? "").trim();
  if (!k) throw new Error("SCRAPINGBEE_KEY or SCRAPINGBEE_API_KEY missing in Edge Function secrets");
  return k;
}

function imgbbKey(): string {
  return (Deno.env.get("IMGBB_KEY") ?? Deno.env.get("IMGBB_API_KEY") ?? "").trim();
}

async function getUserIdFromJwt(
  supabaseUrl: string,
  supabaseAnonKey: string,
  req: Request,
): Promise<string | null> {
  if (!supabaseUrl || !supabaseAnonKey) return null;
  const authHeader = req.headers.get("Authorization") ?? req.headers.get("authorization");
  if (!authHeader?.startsWith("Bearer ")) return null;
  const jwt = authHeader.slice("Bearer ".length).trim();
  if (!jwt) return null;
  const authClient = createClient(supabaseUrl, supabaseAnonKey, {
    global: { headers: { Authorization: `Bearer ${jwt}` } },
  });
  const { data: { user }, error } = await authClient.auth.getUser();
  if (error || !user?.id) {
    console.warn("getUser: session not resolved");
    return null;
  }
  return user.id;
}

/**
 * Resolve auth user id without a round-trip when getUser() fails (timeouts, transient auth errors).
 * Only trusts the JWT `sub` after an optional exp check — same id PostgREST uses for RLS.
 */
function decodeJwtSub(req: Request): string | null {
  const authHeader = req.headers.get("Authorization") ?? req.headers.get("authorization");
  if (!authHeader?.startsWith("Bearer ")) return null;
  const token = authHeader.slice("Bearer ".length).trim();
  if (!token) return null;
  const parts = token.split(".");
  if (parts.length < 2) return null;
  try {
    const payloadB64 = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    const pad = payloadB64.length % 4;
    const padded = pad ? payloadB64 + "=".repeat(4 - pad) : payloadB64;
    const payload = JSON.parse(atob(padded)) as { sub?: unknown; exp?: unknown };
    const sub = typeof payload.sub === "string" && payload.sub.length > 0 ? payload.sub : null;
    if (!sub) return null;
    if (typeof payload.exp === "number" && payload.exp * 1000 < Date.now()) {
      console.warn("decodeJwtSub: access token expired");
      return null;
    }
    return sub;
  } catch {
    console.warn("decodeJwtSub: failed to parse JWT payload");
    return null;
  }
}

const ANALYSE_ITEM_BODY_KEYS = [
  "imageBase64",
  "image_base64",
  "mimeType",
  "image_type",
  "user_id",
  "stream",
  "mode",
  "buy_price",
  "partner_shop_id",
  "partnerShopId",
] as const;

// ── Outlier filtering ─────────────────────────────────────────────────────────

function filterOutliers(prices: number[]): number[] {
  if (prices.length === 0) return [];
  const floored = prices.filter((p) => p >= 5);
  if (floored.length === 0) return [];
  if (floored.length === 1) return floored;
  const rawAvg = floored.reduce((a, b) => a + b, 0) / floored.length;
  const firstPass = floored.filter((p) => p >= rawAvg * 0.2 && p <= rawAvg * 3);
  if (firstPass.length === 0) return floored;
  const cleanAvg = firstPass.reduce((a, b) => a + b, 0) / firstPass.length;
  const secondPass = firstPass.filter((p) => p >= cleanAvg * 0.25 && p <= cleanAvg * 2.5);
  return secondPass.length > 0 ? secondPass : firstPass;
}

/** Same multipliers as `src/pages/scan/page.tsx` — used when live eBay median is missing. */
const CONDITION_MULTIPLIER: Record<string, number> = {
  LIKE_NEW: 1.0,
  GOOD: 0.85,
  LIGHT_WEAR: 0.72,
  FADED: 0.55,
  CRACKED_LOGO: 0.45,
  STAINS: 0.35,
  HEAVY_WEAR: 0.30,
};

// ── Price extraction helpers ──────────────────────────────────────────────────

function extractEbayPrices(html: string): { prices: number[]; soldCount: number } {
  const rawPrices: number[] = [];
  const priceRegex = /£\s*(\d+(?:\.\d{1,2})?)/g;
  let m: RegExpExecArray | null;
  while ((m = priceRegex.exec(html)) !== null) {
    const v = parseFloat(m[1]);
    if (v > 0.5 && v < 5000) rawPrices.push(v);
  }
  const soldCount = (html.match(/s-item__selling-status|SOLD|Sold/g) ?? []).length;
  const prices = filterOutliers(rawPrices);
  return { prices, soldCount };
}

function extractVintedPrices(html: string): number[] {
  const rawPrices: number[] = [];
  const priceRegex = /£\s*(\d+(?:\.\d{1,2})?)/g;
  let m: RegExpExecArray | null;
  while ((m = priceRegex.exec(html)) !== null) {
    const v = parseFloat(m[1]);
    if (v > 0.5 && v < 5000) rawPrices.push(v);
  }
  return filterOutliers(rawPrices);
}

function extractDepopPrices(html: string): number[] {
  const rawPrices: number[] = [];
  const priceRegex = /£\s*(\d+(?:\.\d{1,2})?)/g;
  let m: RegExpExecArray | null;
  while ((m = priceRegex.exec(html)) !== null) {
    const v = parseFloat(m[1]);
    if (v > 0.5 && v < 5000) rawPrices.push(v);
  }
  return filterOutliers(rawPrices);
}

// ── Individual eBay listing card extractor ────────────────────────────────────

interface EbayListing {
  title: string;
  price: number;
  image_url: string;
  listing_url: string;
  days_ago: number | null;
}

/** Max sold comps persisted to listing_cache + returned to UI (horizontal carousel). */
const EBAY_LISTING_CARD_CAP = 12;

/**
 * eBay periodically changes SERP markup. Prefer the delimiter that yields the most
 * plausible listing chunks (price + itm URL) so ScrapingBee static HTML still fills comps.
 */
function pickEbayListingHtmlSegments(html: string): string[] {
  const strategies: (() => string[])[] = [
    () => html.split("s-item__wrapper"),
    () => html.split(/<li[^>]*\bclass="[^"]*\bs-item\b[^"]*"/gi),
    () => html.split(/<div[^>]*\bclass="[^"]*\bs-item\b[^"]*"/gi),
  ];

  const scoreSegments = (segments: string[]): number => {
    let n = 0;
    for (let i = 1; i < Math.min(segments.length, 40); i++) {
      const seg = segments[i];
      if (!/£\s*\d/.test(seg)) continue;
      if (!/ebay\.(?:co\.uk|com)\/itm\//i.test(seg)) continue;
      n++;
    }
    return n;
  };

  let best = strategies[0]();
  let bestScore = scoreSegments(best);
  for (let s = 1; s < strategies.length; s++) {
    const segs = strategies[s]();
    const sc = scoreSegments(segs);
    if (sc > bestScore) {
      best = segs;
      bestScore = sc;
    }
  }
  return best;
}

function extractEbayListingCards(html: string): EbayListing[] {
  const results: EbayListing[] = [];
  const seenUrls = new Set<string>();

  const segments = pickEbayListingHtmlSegments(html);

  for (let i = 1; i < segments.length && results.length < EBAY_LISTING_CARD_CAP; i++) {
    const seg = segments[i];

    // Price — must have a valid £ price
    const priceMatch = seg.match(/£\s*(\d+(?:\.\d{1,2})?)/);
    if (!priceMatch) continue;
    const price = parseFloat(priceMatch[1]);
    if (price < 5 || price > 5000) continue;

    // Title — try several patterns eBay uses
    let title = "";
    const t1 = seg.match(/s-item__title[^>]*>(?:<[^>]+>)*([^<]{4,200})/);
    if (t1) title = t1[1].trim();
    if (!title) {
      const t2 = seg.match(/ITEM_TITLE[^>]*>([^<]{4,200})/);
      if (t2) title = t2[1].trim();
    }
    if (!title) {
      const t3 = seg.match(/role="heading"[^>]*>(?:<[^>]+>)*([^<]{4,200})/i);
      if (t3) title = t3[1].trim();
    }
    if (!title) {
      const t4 = seg.match(/"title":\{"_type":"TextualDisplay","textSpans":\[\{"_type":"TextSpan","text":"([^"]{4,500})"/);
      if (t4) title = t4[1].replace(/\\u0026/g, "&").trim();
    }
    // Skip non-product entries
    if (!title || /shop on ebay|new listing/i.test(title)) continue;

    // Image — prefer thumbs URL
    const imgMatch =
      seg.match(/src="(https:\/\/i\.ebayimg\.com\/[^"]+)"/) ??
      seg.match(/src="(https:\/\/thumbs\.ebaystatic\.com\/[^"]+)"/);
    const image_url = imgMatch?.[1] ?? "";

    // Listing URL (.co.uk or .com)
    const urlMatch = seg.match(
      /href="(https:\/\/www\.ebay\.(?:co\.uk|com)\/itm\/[^"?&]+)/i,
    );
    const listing_url = urlMatch?.[1] ?? "";
    if (listing_url && seenUrls.has(listing_url)) continue;
    if (listing_url) seenUrls.add(listing_url);

    // Sold date — parse "DD Mon YYYY" format
    let days_ago: number | null = null;
    const dateMatch = seg.match(/(\d{1,2}\s+(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+\d{4})/i);
    if (dateMatch) {
      try {
        const d = new Date(dateMatch[1]);
        if (!isNaN(d.getTime())) {
          const diff = Math.floor((Date.now() - d.getTime()) / 86400000);
          if (diff >= 0 && diff < 365) days_ago = diff;
        }
      } catch {
        // ignore date parse errors
      }
    }

    results.push({ title, price, image_url, listing_url, days_ago });
  }

  return results;
}

function median(arr: number[]): number {
  if (arr.length === 0) return 0;
  const sorted = [...arr].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 !== 0
    ? sorted[mid]
    : Math.round((sorted[mid - 1] + sorted[mid]) / 2);
}

// ── ScrapingBee fetch ─────────────────────────────────────────────────────────

const SCRAPE_TIMEOUT_MS = 14_000;

async function scrapePage(targetUrl: string): Promise<string> {
  const params = new URLSearchParams({
    api_key: scrapingBeeKey(),
    url: targetUrl,
    render_js: "false",
    premium_proxy: "false",
    block_ads: "true",
    timeout: String(SCRAPE_TIMEOUT_MS),
  });
  const sbUrl = `https://app.scrapingbee.com/api/v1/?${params.toString()}`;
  console.log("ScrapingBee: request started");
  const res = await fetch(sbUrl, { signal: AbortSignal.timeout(SCRAPE_TIMEOUT_MS + 2_000) });
  if (!res.ok) {
    const errText = await res.text();
    console.error("ScrapingBee error:", res.status, "body_len", errText.length);
    return "";
  }
  return await res.text();
}

// ── Build enriched search query using ALL Claude fields ───────────────────────

function isUnknownBrandName(s: string | undefined): boolean {
  if (s === undefined || s === null) return true;
  const t = String(s).trim().toLowerCase();
  return t === "" || t === "unknown" || t === "unknown brand" || t === "n/a" || t === "none";
}

/** Prefer main brand; fall back to sub-brand / category+item so search + UI are not stuck on "Unknown". */
function resolveBrandName(ai: Record<string, unknown>): string {
  const raw = String(ai.brand_name ?? "").trim();
  if (!isUnknownBrandName(raw)) return raw;
  const sub = String(ai.sub_brand ?? "").trim();
  if (sub && !isUnknownBrandName(sub)) return sub;
  const item = String(ai.item_type ?? "").trim();
  const cat = String(ai.category ?? "").trim();
  const style = String(ai.style ?? "").trim();
  const parts = [cat, style, item].filter((p) => p && !isUnknownBrandName(p));
  if (parts.length > 0) return `${parts.join(" ")} (brand unclear)`;
  return "Unknown Brand";
}

function parseAiJsonObject(rawText: string): Record<string, unknown> {
  let cleaned = rawText.replace(/```json\s*/gi, "").replace(/```\s*/g, "").trim();
  const first = cleaned.indexOf("{");
  const last = cleaned.lastIndexOf("}");
  if (first !== -1 && last > first) cleaned = cleaned.slice(first, last + 1);
  return JSON.parse(cleaned) as Record<string, unknown>;
}

function buildSearchQuery(ai: Record<string, unknown>): string {
  const parts: string[] = [];
  const brand = (ai.brand_name as string ?? "").trim();
  if (brand && brand.toLowerCase() !== "unknown") parts.push(brand);
  const subBrand = (ai.sub_brand as string ?? "").trim();
  if (subBrand && subBrand.toLowerCase() !== "unknown" && subBrand.toLowerCase() !== brand.toLowerCase()) parts.push(subBrand);
  const colour = (ai.colour as string ?? "").trim();
  if (colour && colour.toLowerCase() !== "unknown") parts.push(colour);
  const itemType = (ai.item_type as string ?? "").trim();
  if (itemType && itemType.toLowerCase() !== "unknown") parts.push(itemType);
  const gender = (ai.gender as string ?? "").trim();
  if (gender && gender.toLowerCase() !== "unknown" && gender.toLowerCase() !== "unisex") parts.push(gender);
  const style = (ai.style as string ?? "").trim();
  if (style && style.toLowerCase() !== "unknown") parts.push(style);
  const category = (ai.category as string ?? "").trim();
  if (category && category.toLowerCase() !== "unknown") parts.push(category);
  const era = (ai.era as string ?? "").trim();
  if (era && era.toLowerCase() !== "unknown") parts.push(era);

  const seen = new Set<string>();
  const deduped: string[] = [];
  for (const part of parts) {
    const key = part.toLowerCase();
    if (!seen.has(key)) { seen.add(key); deduped.push(part); }
  }
  return deduped.join(" ").trim();
}

const VISION_MODEL = "claude-sonnet-4-20250514";

const VISION_PROMPT = `You are an expert vintage and streetwear grader. Analyse this clothing image in detail.

CRITICAL for brand_name:
- Read every visible word: neck/care labels, chest/back prints, sleeve tags, tongue/heel text on shoes, wash tags, size tabs.
- If you can read ANY brand-like text (Nike, Carhartt, "Champion", team names, spellings), use that exact string for brand_name — do NOT output "Unknown" or "Unknown Brand" while legible branding exists.
- If only a team/league/collab is visible (e.g. "Lakers NBA"), put that in sub_brand and put the parent brand in brand_name if known, else put the clearest visible name in brand_name.
- If truly no readable brand, set brand_name to "Unknown Brand" and still fill item_type, category, colour, gender from the photo.

Return JSON only — no markdown fences, no commentary. Single JSON object:
{
  "brand_name": "main brand e.g. Mitchell and Ness",
  "sub_brand": "team, collection or sub-label visible on item e.g. Philadelphia Eagles, Supreme Box Logo, Chicago Bulls — empty string if none",
  "brand_confidence": 0.0,
  "condition_grade": "LIKE_NEW",
  "item_type_bucket": "MED",
  "trend_score": 5,
  "colour": "primary colour e.g. green, black, white",
  "gender": "mens, womens, or unisex",
  "item_type": "specific item e.g. jersey, hoodie, t-shirt, jacket, jeans, trainers",
  "style": "style descriptor if clearly visible e.g. retro, vintage, oversized, slim fit, tie-dye — empty string if generic",
  "category": "sport league or fashion category if visible e.g. NFL, NBA, NHL, streetwear, workwear — empty string if unclear",
  "era": "decade or era if identifiable e.g. 90s, 2000s, vintage — empty string if unknown"
}
Condition must be one of: LIKE_NEW, GOOD, LIGHT_WEAR, FADED, CRACKED_LOGO, STAINS, HEAVY_WEAR
Item type bucket must be one of: HIGH, MED, LOW
brand_confidence: 0.0–1.0 based on how clearly the brand is visible.`;

async function uploadToImgbb(cleanBase64: string): Promise<string> {
  const ik = imgbbKey();
  if (!ik) {
    console.warn("ImgBB key missing — image_url will be empty");
    return "";
  }
  try {
    const imgbbForm = new FormData();
    imgbbForm.append("image", cleanBase64);
    const imgbbRes = await fetch(`https://api.imgbb.com/1/upload?key=${ik}`, {
      method: "POST",
      body: imgbbForm,
    });
    if (imgbbRes.ok) {
      const imgbbData = await imgbbRes.json();
      const url = imgbbData?.data?.url ?? "";
      console.log("ImgBB upload ok");
      return url;
    }
    const errBody = await imgbbRes.text();
    console.error("ImgBB upload failed:", imgbbRes.status, "body_len", errBody.length);
  } catch (e) {
    console.error("ImgBB upload error:", e instanceof Error ? e.message : "unknown");
  }
  return "";
}

function fetchClaudeVision(cleanBase64: string, resolvedMime: string): Promise<Response> {
  return fetch(ANTHROPIC_API_URL, {
    method: "POST",
    headers: {
      "x-api-key": anthropicKey(),
      "anthropic-version": "2023-06-01",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: VISION_MODEL,
      max_tokens: 1024,
      messages: [
        {
          role: "user",
          content: [
            {
              type: "image",
              source: { type: "base64", media_type: resolvedMime, data: cleanBase64 },
            },
            { type: "text", text: VISION_PROMPT },
          ],
        },
      ],
    }),
  });
}

function isUuidString(s: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(s.trim());
}

/**
 * Optional `partner_shop_id` on the request body: only persisted when the resolved
 * `insertUserId` is a partner and `profiles.partner_shop_id` matches (validated server-side).
 */
async function validatedPartnerShopIdForInsert(
  adminClient: SupabaseClient,
  insertUserId: string | null,
  body: Record<string, unknown>,
  req: Request,
): Promise<string | null> {
  const raw = body.partner_shop_id ?? body.partnerShopId;
  if (raw === undefined || raw === null || String(raw).trim() === "") return null;
  const uuid = String(raw).trim();
  if (!isUuidString(uuid)) {
    throw new Response(JSON.stringify({ error: "Invalid partner_shop_id format" }), {
      status: 400,
      headers: { ...corsHeadersForRequest(req), "Content-Type": "application/json" },
    });
  }
  if (!insertUserId) {
    throw new Response(JSON.stringify({ error: "partner_shop_id requires a resolved user_id" }), {
      status: 400,
      headers: { ...corsHeadersForRequest(req), "Content-Type": "application/json" },
    });
  }
  const { data: prof, error } = await adminClient
    .from("profiles")
    .select("role, partner_shop_id")
    .eq("id", insertUserId)
    .maybeSingle();
  if (error || !prof) {
    throw new Response(JSON.stringify({ error: "Could not verify profile for partner_shop_id" }), {
      status: 403,
      headers: { ...corsHeadersForRequest(req), "Content-Type": "application/json" },
    });
  }
  const role = typeof prof.role === "string" ? prof.role : "user";
  const shopId = prof.partner_shop_id as string | null | undefined;
  if (role !== "partner" || !shopId || shopId !== uuid) {
    throw new Response(JSON.stringify({ error: "partner_shop_id not permitted for this user" }), {
      status: 403,
      headers: { ...corsHeadersForRequest(req), "Content-Type": "application/json" },
    });
  }
  return uuid;
}

interface FinishScanArgs {
  req: Request;
  body: Record<string, unknown>;
  jwtUserId: string | null;
  bodyUserId: string | undefined;
  aiResult: Record<string, unknown>;
  brandName: string;
  searchQuery: string;
  scanId: string;
  imageUrl: string;
  /** SHA-256 hex of scan image base64 (cache key + UI fingerprint). */
  fingerprint: string | null;
}

async function finishScanAfterVision(args: FinishScanArgs): Promise<Record<string, unknown>> {
  const { req, body, jwtUserId, bodyUserId, aiResult, brandName, searchQuery, scanId, imageUrl, fingerprint } = args;

  const encodedQuery = encodeURIComponent(searchQuery);

  const ebayUrl = `https://www.ebay.co.uk/sch/i.html?_nkw=${encodedQuery}&LH_Sold=1&LH_Complete=1`;
  const vintedUrl = `https://www.vinted.co.uk/catalog?search_text=${encodedQuery}&order=relevance`;
  const depopUrl = `https://www.depop.com/search/?q=${encodedQuery}&condition=used`;

  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const serviceKey = (
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ??
    Deno.env.get("SB_KEY") ??
    ""
  ).trim();
  const anonKey = (Deno.env.get("SUPABASE_ANON_KEY") ?? "").trim();
  const authHeader = (req.headers.get("Authorization") ?? req.headers.get("authorization") ?? "").trim();

  let supabase: SupabaseClient;
  if (serviceKey) {
    supabase = createClient(supabaseUrl, serviceKey);
  } else if (authHeader.startsWith("Bearer ") && anonKey) {
    supabase = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    console.log("Using caller JWT for DB (service role unset)");
  } else {
    supabase = createClient(supabaseUrl, anonKey);
    console.error(
      "CRITICAL: No service role and no Bearer token — scans INSERT will fail RLS. Set SUPABASE_SERVICE_ROLE_KEY or call with Authorization: Bearer <access_token>.",
    );
  }

  // Always allow body user_id as fallback: with anon+JWT, RLS WITH CHECK ensures user_id matches auth.uid().
  // Previously the non–service-role branch ignored bodyUserId, so scans were never inserted when getUser()
  // in the edge runtime failed but the client still sent user_id — history stayed empty.
  // Prefer JWT-derived id so row user_id always matches auth.uid() for anon+JWT PostgREST.
  const insertUserId = jwtUserId ?? bodyUserId ?? null;

  let partnerShopIdForRow: string | null = null;
  try {
    partnerShopIdForRow = await validatedPartnerShopIdForInsert(supabase, insertUserId, body, req);
  } catch (e) {
    if (e instanceof Response) throw e;
    throw e;
  }

  const [brandResult, ebayHtml, vintedHtml, depopHtml] = await Promise.allSettled([
    supabase
      .from("brands")
      .select("brand_name, brand_tier, baseline_resale_gbp, vinted_min, vinted_max, ebay_min, ebay_max, depop_min, depop_max, display_tier")
      .ilike("brand_name", brandName)
      .limit(1),
    scrapePage(ebayUrl),
    scrapePage(vintedUrl),
    scrapePage(depopUrl),
  ]);

  let brandData: Record<string, unknown> | null = null;
  if (brandResult.status === "fulfilled") {
    const { data, error } = brandResult.value as { data: Record<string, unknown>[] | null; error: unknown };
    if (error) {
      const err = error as { code?: string; message?: string };
      console.error("Supabase brand lookup error:", err?.code, err?.message);
    }
    brandData = data && data.length > 0 ? data[0] : null;
  }
  console.log("Brand data found:", !!brandData);

  const ebayRaw = ebayHtml.status === "fulfilled" ? ebayHtml.value : "";
  const vintedRaw = vintedHtml.status === "fulfilled" ? vintedHtml.value : "";
  const depopRaw = depopHtml.status === "fulfilled" ? depopHtml.value : "";

  const { prices: ebayPrices, soldCount: ebaySoldCount } = extractEbayPrices(ebayRaw);
  const vintedPrices = extractVintedPrices(vintedRaw);
  const depopPrices = extractDepopPrices(depopRaw);

  console.log(
    `Market scrape counts — eBay: ${ebayPrices.length}, Vinted: ${vintedPrices.length}, Depop: ${depopPrices.length}`,
  );

  const ebayAvgLive = median(ebayPrices);
  const vintedAvgLive = median(vintedPrices);
  const depopAvgLive = median(depopPrices);

  const livePrices = {
    ebay: { avg: ebayAvgLive, listings: ebayPrices.length, soldCount: ebaySoldCount, scraped: ebayPrices.length > 0 },
    vinted: { avg: vintedAvgLive, listings: vintedPrices.length, scraped: vintedPrices.length > 0 },
    depop: { avg: depopAvgLive, listings: depopPrices.length, scraped: depopPrices.length > 0 },
  };

  const ebayListingCards = extractEbayListingCards(ebayRaw);
  console.log("eBay listing cards extracted:", ebayListingCards.length);

  const condRaw = String(aiResult.condition_grade ?? "GOOD").toUpperCase();
  const condGrade = [
    "LIKE_NEW",
    "GOOD",
    "LIGHT_WEAR",
    "FADED",
    "CRACKED_LOGO",
    "STAINS",
    "HEAVY_WEAR",
  ].includes(condRaw)
    ? condRaw
    : "GOOD";

  const buyPriceNum = body.buy_price ? parseFloat(String(body.buy_price)) : 0;
  const brandBaseline = brandData ? Number(brandData.baseline_resale_gbp ?? 40) : 40;
  const conditionMult = CONDITION_MULTIPLIER[condGrade] ?? 0.7;
  const useEbayResale = livePrices.ebay.scraped && livePrices.ebay.avg > 0;
  const resaleVal = useEbayResale
    ? Math.round(livePrices.ebay.avg)
    : Math.round(brandBaseline * conditionMult);
  const PLATFORM_FEE_RATE = 0.12;
  const SHIPPING_GBP = 4;
  const MARGIN_BUFFER_GBP = 10;
  const platformFeeGbp = Math.round(resaleVal * PLATFORM_FEE_RATE);
  const maxBuyPriceGbp = Math.max(
    0,
    Math.round(resaleVal - platformFeeGbp - SHIPPING_GBP - MARGIN_BUFFER_GBP),
  );
  const netProfitGbp =
    buyPriceNum > 0 ? Math.round(resaleVal - buyPriceNum - platformFeeGbp - SHIPPING_GBP) : null;
  const roiPercent = buyPriceNum > 0 ? Math.round(((resaleVal - buyPriceNum) / buyPriceNum) * 100) : null;
  const listingDecision = (() => {
    if (netProfitGbp === null) return "MAYBE" as const;
    if (netProfitGbp > 10) return "BUY" as const;
    if (netProfitGbp > 0) return "MAYBE" as const;
    return "SKIP" as const;
  })();

  const margin = {
    resale_gbp: Math.round(resaleVal),
    platform_fee_rate: PLATFORM_FEE_RATE,
    platform_fee_gbp: platformFeeGbp,
    shipping_gbp: SHIPPING_GBP,
    margin_buffer_gbp: MARGIN_BUFFER_GBP,
    buy_price_gbp: buyPriceNum > 0 ? buyPriceNum : null,
    net_profit_gbp: netProfitGbp,
    max_buy_price_gbp: maxBuyPriceGbp,
    roi_percent: roiPercent,
  };

  const canTryScanInsert = supabaseUrl && (serviceKey || anonKey);
  const shouldPersistScan = Boolean(insertUserId);
  let scanPersist:
    | { ok: true }
    | { ok: false; skipped: true; reason: string }
    | { ok: false; error: { code: string; message: string } };

  if (!canTryScanInsert) {
    console.error("CRITICAL: Supabase URL or public key missing — scan row not persisted");
    scanPersist = { ok: false, skipped: true, reason: "missing_supabase_url_or_anon_key" };
  } else if (!shouldPersistScan) {
    console.warn(
      "Skipping scans insert: could not resolve user_id (Bearer JWT sub / getUser / body user_id with service role).",
    );
    scanPersist = { ok: false, skipped: true, reason: "missing_user_id" };
  } else {
    const userIdForRow = insertUserId as string;
    const bucketRaw = String(aiResult.item_type_bucket ?? "MED").toUpperCase();
    const itemBucket = ["HIGH", "MED", "LOW"].includes(bucketRaw) ? bucketRaw : "MED";

    const scanRecord: Record<string, unknown> = {
      id: scanId,
      user_id: userIdForRow,
      brand_name: brandName,
      brand_confidence: aiResult.brand_confidence ?? 0,
      item_type_bucket: itemBucket,
      condition_grade: condGrade,
      trend_score: Math.min(15, Math.max(0, Number(aiResult.trend_score ?? 5) || 5)),
      buy_price_gbp: buyPriceNum || null,
      expected_resale_gbp: resaleVal,
      resale_adj_gbp: resaleVal,
      net_gbp: netProfitGbp,
      profit_gbp: netProfitGbp,
      roi: roiPercent,
      mode: String(body.mode ?? "standard").toUpperCase(),
      platform: "web",
      decision: listingDecision,
      image_url: imageUrl || null,
    };
    if (partnerShopIdForRow) scanRecord.partner_shop_id = partnerShopIdForRow;

    const { data: insertedScan, error: scanErr } = await supabase
      .from("scans")
      .insert(scanRecord as never)
      .select("id")
      .maybeSingle();

    if (scanErr) {
      console.error("scans INSERT FAILED:", scanErr.code, scanErr.message);
      scanPersist = {
        ok: false,
        error: { code: String(scanErr.code ?? "unknown"), message: String(scanErr.message ?? "insert failed") },
      };
    } else {
      console.log("Scan record saved, id:", insertedScan?.id ?? scanId);
      scanPersist = { ok: true };
    }
  }

  if (ebayListingCards.length > 0 && supabaseUrl && (serviceKey || insertUserId)) {
    const rows = ebayListingCards.map((l) => ({
      scan_id: scanId,
      platform: "ebay",
      title: l.title,
      price_gbp: l.price,
      image_url: l.image_url || null,
      listing_url: l.listing_url || null,
      days_ago: l.days_ago,
    }));
    const { error: insertErr } = await supabase.from("listing_cache").insert(rows);
    if (insertErr) {
      console.error("listing_cache insert error:", insertErr.code, insertErr.message);
    } else console.log("listing_cache rows saved:", rows.length);
  }

  console.log("Scan pipeline complete, scanId:", scanId);

  return {
    ai: aiResult,
    brand: brandData,
    livePrices,
    searchQuery,
    scanId,
    imageUrl,
    margin,
    decision: listingDecision,
    fingerprint,
    scanPersist,
  };
}

async function tryLoadIdentificationCache(
  supabase: SupabaseClient,
  fp: string,
): Promise<Record<string, unknown> | null> {
  const { data, error } = await supabase
    .from("scan_identification_cache")
    .select("payload, created_at, schema_version")
    .eq("fingerprint", fp)
    .maybeSingle();

  if (error) {
    console.warn("scan_identification_cache lookup:", error.message);
    return null;
  }
  if (!data) return null;
  if (Number(data.schema_version) !== IDENT_CACHE_SCHEMA_VERSION) {
    console.log("scan_identification_cache: schema_version mismatch, ignoring row");
    return null;
  }
  const created = new Date(String(data.created_at)).getTime();
  if (!Number.isFinite(created) || Date.now() - created > IDENT_CACHE_TTL_MS) {
    console.log("scan_identification_cache: stale row (>48h), ignoring");
    return null;
  }
  const raw = data.payload;
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const merged = mergeIdentificationFromCache(raw as Record<string, unknown>);
  if (!isIdentificationPayloadUsable(merged)) return null;
  console.log("scan_identification_cache: HIT");
  return merged;
}

async function upsertIdentificationCache(
  supabase: SupabaseClient,
  fp: string,
  ai: Record<string, unknown>,
): Promise<void> {
  const payload = pickIdentificationPayload(ai);
  if (!isIdentificationPayloadUsable(payload)) return;
  const { error } = await supabase.from("scan_identification_cache").upsert(
    {
      fingerprint: fp,
      payload,
      schema_version: IDENT_CACHE_SCHEMA_VERSION,
      created_at: new Date().toISOString(),
    },
    { onConflict: "fingerprint" },
  );
  if (error) console.warn("scan_identification_cache upsert:", error.message);
  else console.log("scan_identification_cache upsert ok");
}

// ── Main handler ──────────────────────────────────────────────────────────────

serve(withRequestLog("analyse-item", async (req, log: RequestLogHandle) => {
  if (req.method === "OPTIONS") {
    return browserPreflightResponse(req);
  }

  let adminStreak: SupabaseClient | null = null;
  let streakUserId: string | null = null;

  try {
    let rawBody: Record<string, unknown>;
    try {
      rawBody = (await req.json()) as Record<string, unknown>;
    } catch {
      console.warn("Invalid JSON body");
      return jsonResponse(req, { error: "Invalid JSON body" }, 400);
    }

    const body = pickBody(rawBody, ANALYSE_ITEM_BODY_KEYS);

    const imageRaw = body.imageBase64 ?? body.image_base64;
    if (typeof imageRaw !== "string" || !imageRaw.trim()) {
      return jsonResponse(req, { error: "No image provided" }, 400);
    }

    const mimeField = body.mimeType ?? body.image_type;
    if (mimeField !== undefined && typeof mimeField !== "string") {
      return jsonResponse(req, { error: "mimeType must be a string" }, 400);
    }
    if (body.user_id !== undefined && typeof body.user_id !== "string") {
      return jsonResponse(req, { error: "user_id must be a string" }, 400);
    }
    if (body.mode !== undefined && typeof body.mode !== "string") {
      return jsonResponse(req, { error: "mode must be a string" }, 400);
    }
    if (body.buy_price !== undefined && body.buy_price !== null) {
      const bp = body.buy_price;
      if (typeof bp !== "number" && typeof bp !== "string") {
        return jsonResponse(req, { error: "buy_price must be a number" }, 400);
      }
    }
    if (body.stream !== undefined && typeof body.stream !== "boolean" && typeof body.stream !== "string") {
      return jsonResponse(req, { error: "stream must be a boolean" }, 400);
    }
    const partnerRaw = body.partner_shop_id ?? body.partnerShopId;
    if (
      partnerRaw !== undefined && partnerRaw !== null && String(partnerRaw).trim() !== "" &&
      typeof partnerRaw !== "string"
    ) {
      return jsonResponse(req, { error: "partner_shop_id must be a string UUID" }, 400);
    }

    const validated = validateScanImageInput(req, imageRaw, mimeField as string | undefined);
    if (validated instanceof Response) return validated;
    const { cleanBase64, mimeType: resolvedMime } = validated;

    const supabaseUrlEarly = Deno.env.get("SUPABASE_URL") ?? "";
    const supabaseAnonEarly = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
    const networkUserId = await getUserIdFromJwt(supabaseUrlEarly, supabaseAnonEarly, req);
    const serviceKeyForRate = (
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ??
      Deno.env.get("SB_KEY") ??
      ""
    ).trim();
    const serviceRolePresent = Boolean(serviceKeyForRate);
    // Always resolve JWT `sub` when getUser() flakes (common with service role + edge runtime).
    // Never gate this on serviceRolePresent — that path dropped decodeJwtSub and left insertUserId null.
    const jwtUserId = networkUserId ?? decodeJwtSub(req);
    const bodyUserId =
      typeof body.user_id === "string" && body.user_id.trim() ? body.user_id.trim() : undefined;
    if (jwtUserId && bodyUserId && jwtUserId !== bodyUserId) {
      console.warn("body.user_id ignored — does not match JWT subject", { jwtUserId });
    }

    const rateLimitUserId = jwtUserId;
    if (serviceKeyForRate && supabaseUrlEarly && rateLimitUserId) {
      const adminRate = createClient(supabaseUrlEarly, serviceKeyForRate, {
        auth: { autoRefreshToken: false, persistSession: false },
      });
      const rateResp = await enforceUserRateLimit({
        admin: adminRate,
        userId: rateLimitUserId,
        functionSlug: RATE_LIMIT_SLUG_ANALYSE_ITEM,
        req,
      });
      if (rateResp) return rateResp;
    } else if (!serviceKeyForRate && rateLimitUserId) {
      console.warn(
        "[rateLimit] service role key missing — skipping RPM enforcement for analyse-item (set secret in production).",
      );
    }

    if (serviceKeyForRate && supabaseUrlEarly) {
      adminStreak = createClient(supabaseUrlEarly, serviceKeyForRate, {
        auth: { autoRefreshToken: false, persistSession: false },
      });
    }
    streakUserId = rateLimitUserId ?? jwtUserId ?? null;
    log.setUser(streakUserId);

    const scanId = crypto.randomUUID();
    const streamRaw = body.stream;
    const streamWanted =
      streamRaw === true || (typeof streamRaw === "string" && streamRaw.toLowerCase() === "true");

    let scanFingerprint: string | null = null;
    try {
      scanFingerprint = await fingerprintFromScanBase64(cleanBase64);
    } catch (e) {
      console.warn("fingerprintFromScanBase64 failed, identification cache disabled:", e instanceof Error ? e.message : "unknown");
    }

    const serviceKeyForCache = (
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ??
      Deno.env.get("SB_KEY") ??
      ""
    ).trim();
    const supabaseUrlForCache = Deno.env.get("SUPABASE_URL") ?? "";
    const supabaseCache =
      scanFingerprint && serviceKeyForCache && supabaseUrlForCache
        ? createClient(supabaseUrlForCache, serviceKeyForCache)
        : null;

    let identificationFromCache = false;
    let cachedIdentification: Record<string, unknown> | null = null;
    if (supabaseCache && scanFingerprint) {
      cachedIdentification = await tryLoadIdentificationCache(supabaseCache, scanFingerprint);
      identificationFromCache = cachedIdentification !== null;
    }

    console.log(
      "Vision path — model:",
      VISION_MODEL,
      "stream:",
      streamWanted,
      "identification_from_cache:",
      identificationFromCache,
    );

    let imageUrl = "";
    let aiResult: Record<string, unknown> = {};

    if (identificationFromCache && cachedIdentification) {
      imageUrl = await uploadToImgbb(cleanBase64);
      aiResult = { ...cachedIdentification };
      console.log("Skipped Anthropic vision — using scan_identification_cache");
    } else {
      const [imgUrl, anthropicRes] = await Promise.all([
        uploadToImgbb(cleanBase64),
        fetchClaudeVision(cleanBase64, resolvedMime),
      ]);
      imageUrl = imgUrl;

      console.log("Anthropic response status:", anthropicRes.status);

      if (!anthropicRes.ok) {
        const errText = await anthropicRes.text();
        console.error("Anthropic error:", anthropicRes.status, "body_len", errText.length);
        await recordScanFailureStreak(adminStreak, streakUserId);
        return jsonResponse(req, { error: "AI analysis failed" }, 500);
      }

      const anthropicData = await anthropicRes.json();
      const rawText = anthropicData?.content?.[0]?.text ?? "";

      try {
        aiResult = parseAiJsonObject(rawText);
      } catch (e) {
        console.error("Failed to parse AI JSON:", e instanceof Error ? e.message : "parse error");
        await recordScanFailureStreak(adminStreak, streakUserId);
        return jsonResponse(req, { error: "Failed to parse AI response" }, 500);
      }
    }

    const brandName: string = resolveBrandName(aiResult);
    console.log("Resolved brand_name:", brandName);
    aiResult = { ...aiResult, brand_name: brandName };

    if (supabaseCache && scanFingerprint) {
      await upsertIdentificationCache(supabaseCache, scanFingerprint, aiResult);
    }

    const searchQuery = buildSearchQuery(aiResult);

    const finishArgs: FinishScanArgs = {
      req,
      body,
      jwtUserId,
      bodyUserId,
      aiResult,
      brandName,
      searchQuery,
      scanId,
      imageUrl,
      fingerprint: scanFingerprint,
    };

    const cors = corsHeadersForRequest(req);

    if (streamWanted) {
      const streamHeaders = {
        ...cors,
        "Content-Type": "application/x-ndjson",
      };
      const enc = new TextEncoder();
      const stream = new ReadableStream({
        async start(controller) {
          const push = (obj: unknown) => {
            controller.enqueue(enc.encode(`${JSON.stringify(obj)}\n`));
          };
          try {
            push({
              event: "analysis",
              data: {
                ai: aiResult,
                imageUrl,
                searchQuery,
                scanId,
                fingerprint: scanFingerprint,
                identification_from_cache: identificationFromCache,
              },
            });
            const full = await finishScanAfterVision(finishArgs);
            push({
              event: "complete",
              data: { ...full, identification_from_cache: identificationFromCache },
            });
          } catch (e) {
            if (e instanceof Response) {
              console.error("stream scan error: HTTP", e.status);
              let safeMessage = `Request failed (${e.status})`;
              try {
                const parsed = JSON.parse(await e.text()) as { error?: string; message?: string };
                safeMessage = parsed.message ?? parsed.error ?? safeMessage;
              } catch {
                /* ignore */
              }
              push({
                event: "error",
                message: safeMessage,
                status: e.status,
              });
              if (e.status >= 500) await recordScanFailureStreak(adminStreak, streakUserId);
            } else {
              console.error("stream scan error:", e instanceof Error ? e.message : "unknown");
              push({ event: "error", message: "Internal error" });
              await recordScanFailureStreak(adminStreak, streakUserId);
            }
          } finally {
            controller.close();
          }
        },
      });
      return new Response(stream, { status: 200, headers: streamHeaders });
    }

    const full = await finishScanAfterVision(finishArgs);
    return new Response(
      JSON.stringify({ ...full, identification_from_cache: identificationFromCache }),
      { status: 200, headers: { ...cors, "Content-Type": "application/json" } },
    );
  } catch (err) {
    if (err instanceof Response) {
      if (err.status >= 500) await recordScanFailureStreak(adminStreak, streakUserId);
      return err;
    }
    console.error("Edge function unhandled error:", err instanceof Error ? err.message : "unknown");
    await recordScanFailureStreak(adminStreak, streakUserId);
    return jsonResponse(req, { error: "Internal server error" }, 500);
  }
}));
