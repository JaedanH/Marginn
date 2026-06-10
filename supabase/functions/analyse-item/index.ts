/**
 * AI vision + marketplace scrape pipeline.
 * Edge secrets: ANTHROPIC_API_KEY, EBAY_APP_ID + EBAY_CERT_ID (Browse API), SCRAPINGBEE_API_KEY (Vinted/Depop only),
 * SUPABASE_URL, SUPABASE_ANON_KEY,
 * SUPABASE_SERVICE_ROLE_KEY (required for `scan_identification_cache` + reliable `scans` insert + **plan RPM / `rate_limit_consume`**),
 * optional IMGBB_API_KEY (preferred; IMGBB_KEY fallback). Startup logs key prefix8 via `_shared/edgeSecrets.ts`.
 */
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  fingerprintFromMultipleScanBase64,
  IDENT_CACHE_SCHEMA_VERSION,
  IDENT_CACHE_TTL_MS,
  isIdentificationPayloadUsable,
  mergeIdentificationFromCache,
  pickIdentificationPayload,
} from "./_shared/identificationCache.ts";
import { browserPreflightResponse, corsHeadersForRequest, jsonResponse } from "./_shared/cors.ts";
import { pickBody } from "./_shared/sanitizeBody.ts";
import { validateScanImageInput, type ValidatedScanImage } from "./_shared/imageValidation.ts";
import { enforceUserRateLimit, RATE_LIMIT_SLUG_ANALYSE_ITEM } from "./_shared/rateLimit.ts";
import { withRequestLog, type RequestLogHandle } from "./_shared/requestLog.ts";
import { recordScanFailureStreak } from "./_shared/scanFailureStreak.ts";
import { calculateFlipScore, resolveSoldVelocity } from "./_shared/flipScore.ts";
import { calculateMScore, mScoreTierFromBrandRow } from "./_shared/calculateMScore.ts";
import {
  MIN_EBAY_SOLD_COMPS_FOR_DISPLAY,
  resolveEbayCompCount,
  shouldSuppressResaleDisplay,
} from "./_shared/ebayCompsTrust.ts";
import { deriveMarketPrices, extractPlatformMarketData } from "./_shared/marketVisionScrape.ts";
import {
  collectComparableDiscards,
  findBestComparables,
  type FindBestComparablesResult,
} from "./_shared/findBestComparables.ts";
import {
  anthropicKey,
  ebayAppIdDiag,
  ebayCertIdDiag,
  imgbbKey,
  logEdgeSecretsAtStartup,
  scrapingBeeKeyDiag,
} from "./_shared/edgeSecrets.ts";
import {
  buildCompletePipelineReport,
  buildFailedReport,
  E,
  pipelineErrorFromStatus,
  pipelineJsonError,
} from "./_shared/pipelineDiagnostics.ts";

const ANTHROPIC_API_URL = "https://api.anthropic.com/v1/messages";

logEdgeSecretsAtStartup("analyse-item");

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
  "images",
] as const;

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

interface EbayListing {
  title: string;
  price: number;
  image_url: string;
  listing_url: string;
  days_ago: number | null;
}

function median(arr: number[]): number {
  if (arr.length === 0) return 0;
  const sorted = [...arr].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 !== 0
    ? sorted[mid]
    : Math.round((sorted[mid - 1] + sorted[mid]) / 2);
}

function positiveBrandBaseline(brandData: Record<string, unknown> | null): number {
  const raw = brandData ? Number(brandData.baseline_resale_gbp ?? 40) : 40;
  return Number.isFinite(raw) && raw > 0 ? raw : 40;
}

function platformPricesFromResult(
  prices: number[],
  listings: Array<{ price: number }>,
): number[] {
  if (prices.length > 0) return prices;
  return deriveMarketPrices(listings.map((l) => l.price));
}

function brandPlatformMidpoint(
  brandData: Record<string, unknown> | null,
  minKey: string,
  maxKey: string,
): number {
  if (!brandData) return 0;
  const min = Number(brandData[minKey] ?? 0);
  const max = Number(brandData[maxKey] ?? 0);
  if (Number.isFinite(min) && Number.isFinite(max) && min > 0 && max > 0) {
    return (min + max) / 2;
  }
  if (Number.isFinite(max) && max > 0) return max;
  if (Number.isFinite(min) && min > 0) return min;
  return 0;
}

function clampResaleGbp(value: number): number {
  if (!Number.isFinite(value) || value <= 0) return 25;
  return Math.max(1, Math.round(value));
}

function resolveResaleGbp(args: {
  ebayPrices: number[];
  vintedPrices: number[];
  depopPrices: number[];
  ebayListingPrices: number[];
  ebayAverageSoldPrice: number | null;
  ebaySoldCount: number;
  brandData: Record<string, unknown> | null;
  brandBaseline: number;
  conditionMult: number;
}): { resaleGbp: number; usedLiveEbay: boolean } {
  const ebayFromScrape = deriveMarketPrices(args.ebayPrices);
  const ebayMedian = median(ebayFromScrape);
  if (ebayFromScrape.length > 0 && ebayMedian > 0) {
    return { resaleGbp: clampResaleGbp(ebayMedian), usedLiveEbay: true };
  }

  if (
    args.ebaySoldCount >= MIN_EBAY_SOLD_COMPS_FOR_DISPLAY &&
    args.ebayAverageSoldPrice != null &&
    args.ebayAverageSoldPrice > 0
  ) {
    return {
      resaleGbp: clampResaleGbp(args.ebayAverageSoldPrice),
      usedLiveEbay: true,
    };
  }

  const fromEbayCards = median(deriveMarketPrices(args.ebayListingPrices));
  if (fromEbayCards > 0) {
    return { resaleGbp: clampResaleGbp(fromEbayCards), usedLiveEbay: true };
  }

  const vintedMed = median(deriveMarketPrices(args.vintedPrices));
  if (vintedMed > 0) return { resaleGbp: clampResaleGbp(vintedMed), usedLiveEbay: false };

  const depopMed = median(deriveMarketPrices(args.depopPrices));
  if (depopMed > 0) return { resaleGbp: clampResaleGbp(depopMed), usedLiveEbay: false };

  const ebayBrandMid = brandPlatformMidpoint(args.brandData, "ebay_min", "ebay_max");
  if (ebayBrandMid > 0) {
    return {
      resaleGbp: clampResaleGbp(ebayBrandMid * args.conditionMult),
      usedLiveEbay: false,
    };
  }

  const vintedBrandMid = brandPlatformMidpoint(args.brandData, "vinted_min", "vinted_max");
  if (vintedBrandMid > 0) {
    return {
      resaleGbp: clampResaleGbp(vintedBrandMid * args.conditionMult),
      usedLiveEbay: false,
    };
  }

  const fallback = Math.round(Math.max(15, args.brandBaseline * args.conditionMult));
  return { resaleGbp: clampResaleGbp(fallback), usedLiveEbay: false };
}

function buildMarginFromResale(
  resaleGbp: number,
  buyPriceNum: number,
): {
  resale_gbp: number;
  platform_fee_rate: number;
  platform_fee_gbp: number;
  shipping_gbp: number;
  margin_buffer_gbp: number;
  buy_price_gbp: number | null;
  net_profit_gbp: number | null;
  max_buy_price_gbp: number;
  roi_percent: number | null;
} {
  const PLATFORM_FEE_RATE = 0.12;
  const SHIPPING_GBP = 4;
  const MARGIN_BUFFER_GBP = 10;
  const resale = clampResaleGbp(resaleGbp);
  const platformFeeGbp = Math.round(resale * PLATFORM_FEE_RATE);
  const maxBuyPriceGbp = Math.max(
    0,
    Math.round(resale - platformFeeGbp - SHIPPING_GBP - MARGIN_BUFFER_GBP),
  );
  const netProfitGbp =
    buyPriceNum > 0 ? Math.round(resale - buyPriceNum - platformFeeGbp - SHIPPING_GBP) : null;
  const roiPercent =
    buyPriceNum > 0 ? Math.round(((resale - buyPriceNum) / buyPriceNum) * 100) : null;
  return {
    resale_gbp: resale,
    platform_fee_rate: PLATFORM_FEE_RATE,
    platform_fee_gbp: platformFeeGbp,
    shipping_gbp: SHIPPING_GBP,
    margin_buffer_gbp: MARGIN_BUFFER_GBP,
    buy_price_gbp: buyPriceNum > 0 ? buyPriceNum : null,
    net_profit_gbp: netProfitGbp,
    max_buy_price_gbp: maxBuyPriceGbp,
    roi_percent: roiPercent,
  };
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

/** Brand string for comparable scoring — prefer readable AI brand over display fallback. */
function brandForComparables(ai: Record<string, unknown>, displayBrand: string): string {
  const raw = String(ai.brand_name ?? "").trim();
  if (!isUnknownBrandName(raw)) return raw;
  const sub = String(ai.sub_brand ?? "").trim();
  if (sub && !isUnknownBrandName(sub)) return sub;
  return displayBrand.replace(/\s*\(\s*brand unclear\s*\)\s*$/i, "").trim() || displayBrand;
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

const VISION_PROMPT = `You are an expert vintage and streetwear grader. You may receive 1–3 photos of the same clothing item from different angles — treat them as one item and merge your conclusions into a single assessment.

CRITICAL for brand_name:
- Read every visible word: neck/care labels, chest/back prints, sleeve tags, tongue/heel text on shoes, wash tags, size tabs.
- If you can read ANY brand-like text (Nike, Carhartt, "Champion", team names, spellings), use that exact string for brand_name — do NOT output "Unknown" or "Unknown Brand" while legible branding exists.
- If only a team/league/collab is visible (e.g. "Lakers NBA"), put that in sub_brand and put the parent brand in brand_name if known, else put the clearest visible name in brand_name.
- If truly no readable brand, set brand_name to "Unknown Brand" and still fill item_type, category, colour, gender from the photo.

CRITICAL for size_label:
- If a printed size tag, neck label size, or care-label size is clearly visible (e.g. "M", "L", "UK 10", "32W 32L", "EU 42"), copy it exactly into size_label.
- If no size is visible on any photo, set size_label to an empty string.

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
  "era": "decade or era if identifiable e.g. 90s, 2000s, vintage — empty string if unknown",
  "size_label": "visible size text e.g. M, UK 10, 32x32 — empty string if no tag visible"
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

function fetchClaudeVisionBatch(images: ValidatedScanImage[]): Promise<Response> {
  const content: Array<
    | { type: "image"; source: { type: "base64"; media_type: string; data: string } }
    | { type: "text"; text: string }
  > = [];
  for (const img of images) {
    content.push({
      type: "image",
      source: { type: "base64", media_type: img.mimeType, data: img.cleanBase64 },
    });
  }
  content.push({ type: "text", text: VISION_PROMPT });
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
      messages: [{ role: "user", content }],
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
  identificationFromCache?: boolean;
}

async function finishScanAfterVision(args: FinishScanArgs): Promise<Record<string, unknown>> {
  const {
    req,
    body,
    jwtUserId,
    bodyUserId,
    aiResult,
    brandName,
    searchQuery,
    scanId,
    imageUrl,
    fingerprint,
    identificationFromCache = false,
  } = args;

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

  const itemTypeForRelevance = String(aiResult.item_type ?? "").trim();

  const [brandResult, ebayMarket, vintedMarket, depopMarket] = await Promise.allSettled([
    supabase
      .from("brands")
      .select("brand_name, brand_tier, baseline_resale_gbp, vinted_min, vinted_max, ebay_min, ebay_max, depop_min, depop_max, display_tier")
      .ilike("brand_name", brandName)
      .limit(1),
    extractPlatformMarketData({
      platform: "ebay",
      searchUrl: ebayUrl,
      searchKeywords: searchQuery,
      brandName,
      itemType: itemTypeForRelevance,
    }),
    extractPlatformMarketData({
      platform: "vinted",
      searchUrl: vintedUrl,
      brandName,
      itemType: itemTypeForRelevance,
    }),
    extractPlatformMarketData({
      platform: "depop",
      searchUrl: depopUrl,
      brandName,
      itemType: itemTypeForRelevance,
    }),
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

  const ebayM = ebayMarket.status === "fulfilled"
    ? ebayMarket.value
    : {
      platform: "ebay" as const,
      prices: [],
      listings: [],
      method: "browse_api" as const,
      soldCount: 0,
      lowConfidence: true,
      averageSoldPrice: null,
    };
  const vintedM = vintedMarket.status === "fulfilled"
    ? vintedMarket.value
    : { platform: "vinted" as const, prices: [], listings: [], method: "regex_fallback" as const, soldCount: 0 };
  const depopM = depopMarket.status === "fulfilled"
    ? depopMarket.value
    : { platform: "depop" as const, prices: [], listings: [], method: "regex_fallback" as const, soldCount: 0 };

  if (ebayMarket.status === "rejected") {
    console.error("[marketVision] eBay pipeline error:", ebayMarket.reason);
  }
  if (vintedMarket.status === "rejected") {
    console.error("[marketVision] Vinted pipeline error:", vintedMarket.reason);
  }
  if (depopMarket.status === "rejected") {
    console.error("[marketVision] Depop pipeline error:", depopMarket.reason);
  }

  const condRawEarly = String(aiResult.condition_grade ?? "GOOD").toUpperCase();
  const condGradeEarly = [
    "LIKE_NEW",
    "GOOD",
    "LIGHT_WEAR",
    "FADED",
    "CRACKED_LOGO",
    "STAINS",
    "HEAVY_WEAR",
  ].includes(condRawEarly)
    ? condRawEarly
    : "GOOD";

  let comparablesResult: FindBestComparablesResult | null = null;
  const comparableBrand = brandForComparables(aiResult, brandName);
  try {
    comparablesResult = findBestComparables(
      {
        brand: comparableBrand,
        type: itemTypeForRelevance,
        colour: String(aiResult.colour ?? ""),
        condition: condGradeEarly,
        size: String(aiResult.size_label ?? ""),
      },
      ebayM.listings,
      vintedM.listings,
      depopM.listings,
    );
    console.log(
      "[findBestComparables]",
      JSON.stringify({
        inputs: {
          ebay: ebayM.listings.length,
          vinted: vintedM.listings.length,
          depop: depopM.listings.length,
          brand: comparableBrand.slice(0, 40),
          type: itemTypeForRelevance.slice(0, 30),
        },
        outputs: {
          ebay_top5: comparablesResult.ebay.top5.length,
          vinted_top5: comparablesResult.vinted.top5.length,
          depop_top5: comparablesResult.depop.top5.length,
          passing: comparablesResult.all_passing.length,
          avg: comparablesResult.average_price,
          confidence: comparablesResult.overall_confidence,
        },
      }),
    );
    if (serviceKey && comparablesResult) {
      const discards = collectComparableDiscards(
        {
          brand: comparableBrand,
          type: itemTypeForRelevance,
          colour: String(aiResult.colour ?? ""),
          condition: condGradeEarly,
          size: String(aiResult.size_label ?? ""),
        },
        ebayM.listings,
        vintedM.listings,
        depopM.listings,
        comparablesResult,
      );
      if (discards.length > 0) {
        const rows = discards.map((d) => ({
          item_brand: d.item_brand,
          item_type: d.item_type,
          discarded_listing_title: d.discarded_listing_title,
          discarded_price: d.discarded_price,
          match_score: d.match_score,
          platform: d.platform,
        }));
        void supabase.from("comparable_discards").insert(rows).then(({ error }) => {
          if (error) {
            console.warn("[findBestComparables] comparable_discards insert:", error.message);
          }
        });
      }
    }
  } catch (e) {
    console.error(
      "[findBestComparables] failed — continuing with raw market averages",
      e instanceof Error ? e.message : "unknown",
    );
  }

  const ebayPrices = platformPricesFromResult(ebayM.prices, ebayM.listings);
  const vintedPrices = platformPricesFromResult(vintedM.prices, vintedM.listings);
  const depopPrices = platformPricesFromResult(depopM.prices, depopM.listings);
  const ebaySoldCount = ebayM.soldCount;

  console.log(
    `Market scrape — eBay: ${ebayPrices.length} (${ebayM.method}), Vinted: ${vintedPrices.length} (${vintedM.method}), Depop: ${depopPrices.length} (${depopM.method})`,
  );

  const ebayAvgLive = median(ebayPrices);
  const vintedAvgLive = median(vintedPrices);
  const depopAvgLive = median(depopPrices);

  const livePrices = {
    ebay: { avg: ebayAvgLive, listings: ebayPrices.length, soldCount: ebaySoldCount, scraped: ebayPrices.length > 0 },
    vinted: { avg: vintedAvgLive, listings: vintedPrices.length, scraped: vintedPrices.length > 0 },
    depop: { avg: depopAvgLive, listings: depopPrices.length, scraped: depopPrices.length > 0 },
  };

  const price_extraction_method = ebayM.method;
  const price_extraction_methods = {
    ebay: ebayM.method,
    vinted: vintedM.method,
    depop: depopM.method,
  };

  const ebayListingCards: EbayListing[] = ebayM.listings.map((l) => ({
    title: l.title,
    price: l.price,
    image_url: l.image_url,
    listing_url: l.listing_url,
    days_ago: l.days_ago,
  }));
  console.log(
    "eBay Finding API:",
    ebayListingCards.length,
    "cards,",
    ebaySoldCount,
    "sold count,",
    "lowConfidence",
    ebayM.lowConfidence ?? false,
    "method:",
    ebayM.method,
  );

  const condGrade = condGradeEarly;

  const buyPriceNum = body.buy_price ? parseFloat(String(body.buy_price)) : 0;
  const brandBaseline = positiveBrandBaseline(brandData);
  const conditionMult = CONDITION_MULTIPLIER[condGrade] ?? 0.7;
  const { resaleGbp: resaleVal, usedLiveEbay: useEbayResale } = resolveResaleGbp({
    ebayPrices,
    vintedPrices,
    depopPrices,
    ebayListingPrices: ebayListingCards.map((c) => c.price),
    ebayAverageSoldPrice: ebayM.averageSoldPrice ?? null,
    ebaySoldCount,
    brandData,
    brandBaseline,
    conditionMult,
  });

  const ebayLiveCompCountVal = resolveEbayCompCount({
    method: ebayM.method,
    soldCount: ebaySoldCount,
    pricesLen: ebayPrices.length,
    listingCardsLen: ebayListingCards.length,
  });
  const insufficientSoldData = shouldSuppressResaleDisplay(ebayLiveCompCountVal);

  let margin = buildMarginFromResale(resaleVal, buyPriceNum);
  if (!insufficientSoldData && margin.resale_gbp <= 0) {
    margin = buildMarginFromResale(
      clampResaleGbp(Math.round(brandBaseline * conditionMult)),
      buyPriceNum,
    );
  }

  if (insufficientSoldData) {
    margin = {
      resale_gbp: 0,
      platform_fee_rate: margin.platform_fee_rate,
      platform_fee_gbp: 0,
      shipping_gbp: margin.shipping_gbp,
      margin_buffer_gbp: margin.margin_buffer_gbp,
      buy_price_gbp: margin.buy_price_gbp,
      net_profit_gbp: null,
      max_buy_price_gbp: 0,
      roi_percent: null,
    };
    livePrices.ebay.avg = ebayAvgLive > 0 ? ebayAvgLive : 0;
    livePrices.ebay.listings = ebayLiveCompCountVal;
    livePrices.ebay.scraped = ebayLiveCompCountVal > 0;
  } else {
    livePrices.ebay.avg = margin.resale_gbp;
    if (ebayListingCards.length > 0 || ebayPrices.length > 0) {
      livePrices.ebay.scraped = true;
      livePrices.ebay.listings = Math.max(
        livePrices.ebay.listings,
        ebayListingCards.length,
        ebayPrices.length,
      );
    }
  }

  const netProfitGbp = margin.net_profit_gbp;
  let listingDecision = (() => {
    if (insufficientSoldData) return "MAYBE" as const;
    if (netProfitGbp === null) return "MAYBE" as const;
    if (netProfitGbp > 10) return "BUY" as const;
    if (netProfitGbp > 0) return "MAYBE" as const;
    return "SKIP" as const;
  })();

  console.log(
    "Resale resolved:",
    insufficientSoldData ? "suppressed" : margin.resale_gbp,
    "ebay_comps",
    ebayLiveCompCountVal,
    "min_required",
    MIN_EBAY_SOLD_COMPS_FOR_DISPLAY,
    "live_ebay",
    useEbayResale,
  );

  const liveListingTotal =
    (livePrices.ebay.listings ?? 0) +
    (livePrices.vinted.listings ?? 0) +
    (livePrices.depop.listings ?? 0);

  const flipInputKeywords = [
    brandName,
    String(aiResult.item_type ?? ""),
    String(aiResult.category ?? ""),
    String(aiResult.style ?? ""),
    String(aiResult.colour ?? ""),
  ].filter((s) => s.trim().length > 0);

  const flipResult = calculateFlipScore({
    ebaySoldCards: ebayListingCards.map((c) => ({ days_ago: c.days_ago })),
    ebayPrices,
    brandRow: brandData,
    condition_grade: condGrade,
    buy_price_gbp: margin.buy_price_gbp,
    net_profit_gbp: margin.net_profit_gbp,
    roi_percent: margin.roi_percent,
    resale_gbp: margin.resale_gbp,
    liveListingTotal,
    soldMarkersOnPage: ebaySoldCount,
    month: new Date().getUTCMonth() + 1,
    itemKeywords: flipInputKeywords,
  });
  flipResult.breakdown.vision_trend_hint = Math.min(
    15,
    Math.max(0, Number(aiResult.trend_score ?? 5) || 5),
  );

  const soldVel = resolveSoldVelocity(
    ebayListingCards.map((c) => ({ days_ago: c.days_ago })),
    ebaySoldCount,
  );
  const sortedPrices = [...ebayPrices].sort((a, b) => a - b);
  const avgPrice =
    sortedPrices.length > 0
      ? sortedPrices.reduce((a, b) => a + b, 0) / sortedPrices.length
      : resaleVal;
  const minPrice = sortedPrices.length > 0 ? sortedPrices[0]! : resaleVal;
  const maxPrice = sortedPrices.length > 0 ? sortedPrices[sortedPrices.length - 1]! : resaleVal;
  const bucketRaw = String(aiResult.item_type_bucket ?? "MED").toUpperCase();
  const itemBucket = ["HIGH", "MED", "LOW"].includes(bucketRaw) ? bucketRaw : "MED";
  const mScoreTier = mScoreTierFromBrandRow(brandData, itemBucket);
  const mScoreResult = calculateMScore({
    soldLast7: soldVel.d7,
    soldLast30: soldVel.d30,
    liveListings: Math.max(1, liveListingTotal),
    avgPrice,
    minPrice,
    maxPrice,
    netProfit: netProfitGbp ?? 0,
    brandTier: mScoreTier,
    conditionGrade: condGrade,
    itemType: String(aiResult.item_type ?? ""),
    brandConfidence: Math.min(1, Math.max(0, Number(aiResult.brand_confidence ?? 0) || 0)),
    buyPrice: buyPriceNum,
    listingCountUsed: ebayPrices.length,
    month: new Date().getUTCMonth() + 1,
  });

  if (comparablesResult) {
    comparablesResult.m_score_recalc = {
      sold_last7: soldVel.d7,
      sold_last30: soldVel.d30,
      live_listings: Math.max(1, liveListingTotal),
      net_profit: netProfitGbp ?? 0,
      brand_tier: mScoreTier,
      condition_grade: condGrade,
      item_type: String(aiResult.item_type ?? ""),
      brand_confidence: Math.min(1, Math.max(0, Number(aiResult.brand_confidence ?? 0) || 0)),
      buy_price: buyPriceNum,
      month: new Date().getUTCMonth() + 1,
    };
  }

  const canTryScanInsert = supabaseUrl && (serviceKey || anonKey);
  const shouldPersistScan = Boolean(insertUserId);
  let scanPersist:
    | { ok: true }
    | { ok: false; skipped: true; reason: string }
    | { ok: false; error: { code: string; message: string } };
  let shareToken: string | null = null;

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

    const scanRecord: Record<string, unknown> = {
      id: scanId,
      user_id: userIdForRow,
      brand_name: brandName,
      brand_confidence: aiResult.brand_confidence ?? 0,
      item_type_bucket: itemBucket,
      condition_grade: condGrade,
      trend_score: Math.min(15, Math.max(0, Number(aiResult.trend_score ?? 5) || 5)),
      flip_score: flipResult.score,
      flip_score_breakdown: flipResult.breakdown,
      m_score: mScoreResult.score,
      m_score_breakdown: mScoreResult,
      buy_price_gbp: buyPriceNum || null,
      expected_resale_gbp: insufficientSoldData ? null : margin.resale_gbp,
      resale_adj_gbp: insufficientSoldData ? null : margin.resale_gbp,
      net_gbp: netProfitGbp,
      profit_gbp: netProfitGbp,
      roi: margin.roi_percent,
      mode: String(body.mode ?? "standard").toUpperCase(),
      platform: "web",
      decision: listingDecision,
      image_url: imageUrl || null,
    };
    if (partnerShopIdForRow) scanRecord.partner_shop_id = partnerShopIdForRow;

    console.log("scans INSERT attempt", {
      scanId,
      userId: userIdForRow.slice(0, 8),
      serviceRole: Boolean(serviceKey),
      hasAuthHeader: authHeader.startsWith("Bearer "),
    });

    try {
      const { data: insertedScan, error: scanErr } = await supabase
        .from("scans")
        .insert(scanRecord as never)
        .select("id")
        .maybeSingle();

      if (scanErr) {
        console.error("scans INSERT FAILED:", scanErr.code, scanErr.message, "scanId", scanId);
        scanPersist = {
          ok: false,
          error: { code: String(scanErr.code ?? "unknown"), message: String(scanErr.message ?? "insert failed") },
        };
      } else {
        console.log(
          "Scan record saved, id:",
          insertedScan?.id ?? scanId,
          "user",
          userIdForRow.slice(0, 8),
        );
        scanPersist = { ok: true };
        const { data: tokenRow } = await supabase
          .from("scans")
          .select("share_token")
          .eq("id", scanId)
          .maybeSingle();
        const tok = (tokenRow as { share_token?: string } | null)?.share_token;
        if (tok && typeof tok === "string") shareToken = tok;
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error("scans INSERT exception:", msg, "scanId", scanId);
      scanPersist = {
        ok: false,
        error: { code: "exception", message: msg },
      };
    }
  }

  const cacheListings = [
    ...ebayM.listings.map((l) => ({ ...l, platform: "ebay" as const })),
    ...vintedM.listings.map((l) => ({ ...l, platform: "vinted" as const })),
    ...depopM.listings.map((l) => ({ ...l, platform: "depop" as const })),
  ];
  if (cacheListings.length === 0 && ebayListingCards.length > 0) {
    for (const l of ebayListingCards) {
      cacheListings.push({
        title: l.title,
        price: l.price,
        image_url: l.image_url,
        listing_url: l.listing_url,
        days_ago: l.days_ago,
        relevance_score: 0,
        platform: "ebay",
      });
    }
  }

  if (cacheListings.length > 0 && supabaseUrl && (serviceKey || insertUserId)) {
    const rows = cacheListings.map((l) => ({
      scan_id: scanId,
      platform: l.platform,
      title: l.title,
      price_gbp: l.price,
      image_url: l.image_url || null,
      listing_url: l.listing_url || null,
      days_ago: l.days_ago,
      relevance_score: l.relevance_score ?? null,
    }));
    const { error: insertErr } = await supabase.from("listing_cache").insert(rows);
    if (insertErr) {
      console.error("listing_cache insert error:", insertErr.code, insertErr.message);
    } else console.log("listing_cache rows saved:", rows.length);
  }

  console.log("Scan pipeline complete, scanId:", scanId);

  const pipeline_report = buildCompletePipelineReport({
    aiResult,
    brandName,
    insufficientSoldData,
    ebayLiveCompCount: ebayLiveCompCountVal,
    ebayScrapeRejected: ebayMarket.status === "rejected",
    vintedScrapeRejected: vintedMarket.status === "rejected",
    depopScrapeRejected: depopMarket.status === "rejected",
    scrapingBeeConfigured: scrapingBeeKeyDiag().present,
    ebayFindingConfigured: ebayAppIdDiag().present && ebayCertIdDiag().present,
    scanPersist,
    identificationFromCache,
    visionSkipped: identificationFromCache,
  });

  const scrapedAt = new Date().toISOString();
  const usedFallbackResale = insufficientSoldData || !useEbayResale;
  const soldCompPreviews = ebayListingCards.slice(0, 3).map((l, i) => ({
    id: `edge-preview-${scanId.slice(0, 8)}-${i}`,
    scan_id: scanId,
    platform: "ebay",
    title: l.title,
    price_gbp: l.price,
    image_url: l.image_url || null,
    listing_url: l.listing_url || null,
    days_ago: l.days_ago,
  }));

  return {
    ai: aiResult,
    brand: brandData,
    livePrices,
    searchQuery,
    scanId,
    imageUrl,
    margin,
    resale_price: insufficientSoldData ? null : margin.resale_gbp,
    insufficient_sold_data: insufficientSoldData,
    ebay_sold_comp_count: ebayLiveCompCountVal,
    ebay_low_confidence: ebayM.lowConfidence === true || insufficientSoldData,
    ebay_average_sold_price: ebayM.averageSoldPrice ?? null,
    min_sold_comps_required: MIN_EBAY_SOLD_COMPS_FOR_DISPLAY,
    decision: listingDecision,
    fingerprint,
    share_token: shareToken,
    scanPersist,
    scraped_at: scrapedAt,
    used_fallback_resale: usedFallbackResale,
    price_extraction_method,
    price_extraction_methods,
    sold_comp_previews: soldCompPreviews,
    flip_score: flipResult.score,
    flip_score_breakdown: flipResult.breakdown,
    m_score: mScoreResult.score,
    m_score_breakdown: mScoreResult,
    sold_velocity: {
      d7: flipResult.breakdown.sold_velocity.d7,
      d30: flipResult.breakdown.sold_velocity.d30,
    },
    vision_trend_hint: flipResult.breakdown.vision_trend_hint,
    pipeline_report,
    pipeline_primary_code: pipeline_report.primary_code,
    pipeline_issue_category: pipeline_report.issue_category,
    comparables: comparablesResult,
    comparables_average_price: comparablesResult?.average_price ?? null,
    comparables_overall_confidence: comparablesResult?.overall_confidence ?? null,
  };
}

function imageValidationFailure(req: Request, res: Response): Response {
  const status = res.status;
  let code = E.IMAGE_INVALID;
  if (status === 413) code = E.IMAGE_TOO_LARGE;
  return pipelineErrorFromStatus(req, status, { error: "Image validation failed" }, code);
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
      return pipelineJsonError(req, E.INVALID_BODY, "Invalid JSON body", 400);
    }

    const body = pickBody(rawBody, ANALYSE_ITEM_BODY_KEYS);

    if (body.images !== undefined && !Array.isArray(body.images)) {
      return jsonResponse(req, { error: "images must be an array" }, 400);
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

    const validatedImages: ValidatedScanImage[] = [];
    const rawImages = body.images;
    if (Array.isArray(rawImages) && rawImages.length > 0) {
      const capped = rawImages.slice(0, 3);
      for (let i = 0; i < capped.length; i++) {
        const item = capped[i];
        if (!item || typeof item !== "object" || Array.isArray(item)) {
          return jsonResponse(req, { error: `images[${i}] must be an object` }, 400);
        }
        const rec = item as Record<string, unknown>;
        const b64 = rec.base64 ?? rec.image_base64;
        const mime = rec.mime ?? rec.mimeType ?? rec.image_type;
        if (typeof b64 !== "string" || !b64.trim()) {
          return jsonResponse(req, { error: `images[${i}] missing base64` }, 400);
        }
        const validatedOne = validateScanImageInput(req, b64, typeof mime === "string" ? mime : undefined);
        if (validatedOne instanceof Response) return imageValidationFailure(req, validatedOne);
        validatedImages.push(validatedOne);
      }
    }

    if (validatedImages.length === 0) {
      const imageRaw = body.imageBase64 ?? body.image_base64;
      if (typeof imageRaw !== "string" || !imageRaw.trim()) {
        return pipelineJsonError(req, E.NO_IMAGE, "No image provided", 400, {
          image: { status: "failed", code: E.NO_IMAGE },
        });
      }
      const mimeField = body.mimeType ?? body.image_type;
      if (mimeField !== undefined && typeof mimeField !== "string") {
        return jsonResponse(req, { error: "mimeType must be a string" }, 400);
      }
      const validatedOne = validateScanImageInput(req, imageRaw, mimeField as string | undefined);
      if (validatedOne instanceof Response) return imageValidationFailure(req, validatedOne);
      validatedImages.push(validatedOne);
    }

    const primaryB64 = validatedImages[0]!.cleanBase64;

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

    const authHeaderEarly = (req.headers.get("Authorization") ?? req.headers.get("authorization") ?? "").trim();
    console.log("Auth for scans persist:", {
      jwtUserId: jwtUserId ? jwtUserId.slice(0, 8) : null,
      bodyUserId: bodyUserId ? bodyUserId.slice(0, 8) : null,
      hasBearer: authHeaderEarly.startsWith("Bearer "),
      serviceRolePresent,
    });

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
      if (rateResp) {
        if (rateResp.status === 429) {
          return pipelineJsonError(req, E.RATE_LIMIT, "Rate limit exceeded", 429, {
            rate_limit: { status: "failed", code: E.RATE_LIMIT },
          });
        }
        if (rateResp.status === 503) {
          return pipelineJsonError(req, E.RATE_LIMIT_CHECK, "Rate limit check failed", 503, {
            rate_limit: { status: "failed", code: E.RATE_LIMIT_CHECK },
          });
        }
        return rateResp;
      }
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
      scanFingerprint = await fingerprintFromMultipleScanBase64(
        validatedImages.map((v) => v.cleanBase64),
      );
    } catch (e) {
      console.warn(
        "fingerprintFromMultipleScanBase64 failed, identification cache disabled:",
        e instanceof Error ? e.message : "unknown",
      );
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
      imageUrl = await uploadToImgbb(primaryB64);
      aiResult = { ...cachedIdentification };
      console.log("Skipped Anthropic vision — using scan_identification_cache");
    } else {
      const [imgUrl, anthropicRes] = await Promise.all([
        uploadToImgbb(primaryB64),
        fetchClaudeVisionBatch(validatedImages),
      ]);
      imageUrl = imgUrl;

      console.log("Anthropic response status:", anthropicRes.status);

      if (!anthropicRes.ok) {
        const errText = await anthropicRes.text();
        console.error("Anthropic error:", anthropicRes.status, "body_len", errText.length);
        await recordScanFailureStreak(adminStreak, streakUserId);
        return pipelineJsonError(req, E.ANTHROPIC, "AI analysis failed", 500, {
          vision: { status: "failed", code: E.ANTHROPIC, detail: String(anthropicRes.status) },
        });
      }

      const anthropicData = await anthropicRes.json();
      const rawText = anthropicData?.content?.[0]?.text ?? "";

      try {
        aiResult = parseAiJsonObject(rawText);
      } catch (e) {
        console.error("Failed to parse AI JSON:", e instanceof Error ? e.message : "parse error");
        await recordScanFailureStreak(adminStreak, streakUserId);
        return pipelineJsonError(req, E.AI_PARSE, "Failed to parse AI response", 500, {
          vision: { status: "failed", code: E.AI_PARSE },
        });
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
      identificationFromCache,
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
              let errorCode = e.status >= 500 ? E.INTERNAL : E.VALIDATION;
              let pipeline_report = buildFailedReport(errorCode);
              try {
                const parsed = JSON.parse(await e.text()) as {
                  error?: string;
                  message?: string;
                  error_code?: string;
                  pipeline_report?: typeof pipeline_report;
                };
                safeMessage = parsed.message ?? parsed.error ?? safeMessage;
                if (parsed.error_code) errorCode = parsed.error_code;
                if (parsed.pipeline_report) pipeline_report = parsed.pipeline_report;
              } catch {
                /* ignore */
              }
              push({
                event: "error",
                message: safeMessage,
                status: e.status,
                error_code: errorCode,
                pipeline_report,
              });
              if (e.status >= 500) await recordScanFailureStreak(adminStreak, streakUserId);
            } else {
              console.error("stream scan error:", e instanceof Error ? e.message : "unknown");
              const pipeline_report = buildFailedReport(E.STREAM);
              push({
                event: "error",
                message: pipeline_report.user_message,
                error_code: E.STREAM,
                pipeline_report,
              });
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
    return pipelineJsonError(req, E.INTERNAL, "Internal server error", 500);
  }
}));
