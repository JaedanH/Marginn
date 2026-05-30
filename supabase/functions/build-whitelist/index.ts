/**
 * Weekly item_whitelist builder — eBay sold + Vinted/Depop listed comps per brand.
 *
 * Secrets: EBAY_APP_ID, SCRAPINGBEE_API_KEY, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 * Optional: BUILD_WHITELIST_SECRET (cron/manual invoke without JWT)
 *
 * Deploy: `supabase functions deploy build-whitelist`
 *
 * Scheduling (pick one):
 * 1. Supabase Dashboard → Edge Functions → build-whitelist → Cron → `0 3 * * 0` (Sun 03:00 UTC)
 *    Body: `{"brand_offset":0,"brand_limit":4,"chain":true}`
 * 2. pg_cron: see `supabase/migrations/20260601120100_build_whitelist_cron.sql`
 *
 * Timeout strategy:
 * - Default `brand_limit` = 4 brands per invocation (~12 ScrapingBee + 4 eBay calls).
 * - Pass `"chain": true` to fire-and-forget the next batch until all 30 brands are done.
 * - Full weekly run ≈ 8 chained invocations; avoid `brand_limit: 30` in one call (150s+ risk).
 *
 * POST body (all optional):
 * `{ "brand_offset": 0, "brand_limit": 4, "chain": true, "platforms": ["ebay","vinted","depop"] }`
 */
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { fetchEbaySoldListingsForWhitelist } from "../_shared/ebayWhitelistFetch.ts";
import { logEdgeSecretsAtStartup } from "../_shared/edgeSecrets.ts";
import {
  fetchDepopListingsForWhitelist,
  fetchVintedListingsForWhitelist,
} from "../_shared/htmlWhitelistScrape.ts";
import { itemTypeFromTitle } from "../_shared/itemTypeFromTitle.ts";
import { withRequestLog, type RequestLogHandle } from "../_shared/requestLog.ts";
import {
  depopSearchUrl,
  vintedSearchUrl,
  WHITELIST_BRANDS,
} from "../_shared/whitelistBrands.ts";

const JSON_HEADERS = { "Content-Type": "application/json" };
const DEFAULT_BRAND_LIMIT = 4;
const PLATFORMS = ["ebay", "vinted", "depop"] as const;
type Platform = (typeof PLATFORMS)[number];

type WhitelistInsertRow = {
  brand: string;
  platform: Platform;
  listing_id: string;
  listing_title: string;
  price: number;
  condition: string | null;
  category: string | null;
  image_url: string | null;
  listing_url: string | null;
  date_scraped: string;
  date_sold: string | null;
  item_type: string;
};

type BuildBody = {
  brand_offset?: number;
  brand_limit?: number;
  chain?: boolean;
  platforms?: Platform[];
};

function parseBody(raw: unknown): BuildBody {
  if (!raw || typeof raw !== "object") return {};
  const o = raw as Record<string, unknown>;
  const brand_offset = typeof o.brand_offset === "number" && o.brand_offset >= 0
    ? Math.floor(o.brand_offset)
    : undefined;
  const brand_limit = typeof o.brand_limit === "number" && o.brand_limit > 0
    ? Math.min(30, Math.floor(o.brand_limit))
    : undefined;
  const chain = o.chain === true;
  let platforms: Platform[] | undefined;
  if (Array.isArray(o.platforms)) {
    platforms = o.platforms.filter((p): p is Platform =>
      p === "ebay" || p === "vinted" || p === "depop"
    );
  }
  return { brand_offset, brand_limit, chain, platforms };
}

function parseDateSold(raw: string | null): string | null {
  if (!raw) return null;
  const ms = Date.parse(raw);
  if (!Number.isFinite(ms)) return null;
  return new Date(ms).toISOString();
}

function authorize(req: Request): boolean {
  const cronSecret = (Deno.env.get("BUILD_WHITELIST_SECRET") ?? "").trim();
  if (cronSecret) {
    const hdr = (req.headers.get("X-Build-Whitelist-Secret") ??
      req.headers.get("x-build-whitelist-secret") ?? "").trim();
    if (hdr === cronSecret) return true;
  }
  const auth = (req.headers.get("Authorization") ?? "").trim();
  const serviceKey = (Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "").trim();
  if (serviceKey && auth === `Bearer ${serviceKey}`) return true;
  return false;
}

async function existingListingIds(
  supabase: ReturnType<typeof createClient>,
  platform: Platform,
  ids: string[],
): Promise<Set<string>> {
  if (ids.length === 0) return new Set();
  const { data, error } = await supabase
    .from("item_whitelist")
    .select("listing_id")
    .eq("platform", platform)
    .in("listing_id", ids);
  if (error) {
    console.error("[build-whitelist] dedup lookup failed", platform, error.message);
    return new Set();
  }
  return new Set((data ?? []).map((r: { listing_id: string }) => r.listing_id));
}

async function insertRows(
  supabase: ReturnType<typeof createClient>,
  rows: WhitelistInsertRow[],
): Promise<number> {
  if (rows.length === 0) return 0;
  const { error } = await supabase.from("item_whitelist").insert(rows);
  if (error) {
    console.error("[build-whitelist] insert error", error.code, error.message);
    return 0;
  }
  return rows.length;
}

async function processBrand(
  supabase: ReturnType<typeof createClient>,
  brand: string,
  platforms: Platform[],
): Promise<{ inserted: number; skipped: number; errors: string[] }> {
  const nowIso = new Date().toISOString();
  let inserted = 0;
  let skipped = 0;
  const errors: string[] = [];

  console.log("[build-whitelist] brand start", brand);

  if (platforms.includes("ebay")) {
    try {
      const listings = await fetchEbaySoldListingsForWhitelist(brand);
      const ids = listings.map((l) => l.listing_id);
      const existing = await existingListingIds(supabase, "ebay", ids);
      const rows: WhitelistInsertRow[] = [];
      for (const l of listings) {
        if (existing.has(l.listing_id)) {
          skipped++;
          continue;
        }
        rows.push({
          brand,
          platform: "ebay",
          listing_id: l.listing_id,
          listing_title: l.listing_title,
          price: l.price,
          condition: l.condition,
          category: l.category,
          image_url: l.image_url,
          listing_url: l.listing_url,
          date_scraped: nowIso,
          date_sold: parseDateSold(l.date_sold),
          item_type: itemTypeFromTitle(l.listing_title),
        });
      }
      inserted += await insertRows(supabase, rows);
      console.log("[build-whitelist] ebay", brand, { fetched: listings.length, inserted: rows.length });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      errors.push(`ebay:${msg}`);
      console.error("[build-whitelist] ebay failed", brand, msg);
    }
  }

  if (platforms.includes("vinted")) {
    try {
      const listings = await fetchVintedListingsForWhitelist(vintedSearchUrl(brand));
      const ids = listings.map((l) => l.listing_id);
      const existing = await existingListingIds(supabase, "vinted", ids);
      const rows: WhitelistInsertRow[] = [];
      for (const l of listings) {
        if (existing.has(l.listing_id)) {
          skipped++;
          continue;
        }
        rows.push({
          brand,
          platform: "vinted",
          listing_id: l.listing_id,
          listing_title: l.listing_title,
          price: l.price,
          condition: l.condition,
          category: null,
          image_url: l.image_url,
          listing_url: l.listing_url,
          date_scraped: nowIso,
          date_sold: null,
          item_type: itemTypeFromTitle(l.listing_title),
        });
      }
      inserted += await insertRows(supabase, rows);
      console.log("[build-whitelist] vinted", brand, { fetched: listings.length, inserted: rows.length });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      errors.push(`vinted:${msg}`);
      console.error("[build-whitelist] vinted failed", brand, msg);
    }
  }

  if (platforms.includes("depop")) {
    try {
      const listings = await fetchDepopListingsForWhitelist(depopSearchUrl(brand));
      const ids = listings.map((l) => l.listing_id);
      const existing = await existingListingIds(supabase, "depop", ids);
      const rows: WhitelistInsertRow[] = [];
      for (const l of listings) {
        if (existing.has(l.listing_id)) {
          skipped++;
          continue;
        }
        rows.push({
          brand,
          platform: "depop",
          listing_id: l.listing_id,
          listing_title: l.listing_title,
          price: l.price,
          condition: l.condition,
          category: null,
          image_url: l.image_url,
          listing_url: l.listing_url,
          date_scraped: nowIso,
          date_sold: null,
          item_type: itemTypeFromTitle(l.listing_title),
        });
      }
      inserted += await insertRows(supabase, rows);
      console.log("[build-whitelist] depop", brand, { fetched: listings.length, inserted: rows.length });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      errors.push(`depop:${msg}`);
      console.error("[build-whitelist] depop failed", brand, msg);
    }
  }

  console.log("[build-whitelist] brand done", brand, { inserted, skipped, errors: errors.length });
  return { inserted, skipped, errors };
}

function chainNextInvocation(body: BuildBody, nextOffset: number): void {
  const supabaseUrl = (Deno.env.get("SUPABASE_URL") ?? "").trim();
  const serviceKey = (Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "").trim();
  if (!supabaseUrl || !serviceKey) {
    console.warn("[build-whitelist] chain skipped — missing SUPABASE_URL or service role");
    return;
  }

  const payload = {
    brand_offset: nextOffset,
    brand_limit: body.brand_limit ?? DEFAULT_BRAND_LIMIT,
    chain: true,
    platforms: body.platforms,
  };

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${serviceKey}`,
  };
  const cronSecret = (Deno.env.get("BUILD_WHITELIST_SECRET") ?? "").trim();
  if (cronSecret) headers["X-Build-Whitelist-Secret"] = cronSecret;

  const chainPromise = fetch(`${supabaseUrl}/functions/v1/build-whitelist`, {
    method: "POST",
    headers,
    body: JSON.stringify(payload),
  }).then((res) => {
    console.log("[build-whitelist] chained invocation", res.status, "offset", nextOffset);
  }).catch((e) => {
    console.error("[build-whitelist] chain failed", e instanceof Error ? e.message : String(e));
  });

  const er = (globalThis as { EdgeRuntime?: { waitUntil?: (p: Promise<unknown>) => void } }).EdgeRuntime;
  if (er?.waitUntil) {
    er.waitUntil(chainPromise);
  }
}

serve(
  withRequestLog("build-whitelist", async (req, log: RequestLogHandle) => {
    logEdgeSecretsAtStartup("build-whitelist");

    if (req.method === "OPTIONS") {
      return new Response(null, { status: 204 });
    }

    if (req.method !== "POST") {
      return new Response(JSON.stringify({ error: "Method not allowed" }), {
        status: 405,
        headers: JSON_HEADERS,
      });
    }

    if (!authorize(req)) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: JSON_HEADERS,
      });
    }

    const supabaseUrl = (Deno.env.get("SUPABASE_URL") ?? "").trim();
    const serviceKey = (Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "").trim();
    if (!supabaseUrl || !serviceKey) {
      log.setDetail("missing supabase env");
      return new Response(JSON.stringify({ error: "Server not configured" }), {
        status: 503,
        headers: JSON_HEADERS,
      });
    }

    let body: BuildBody = {};
    try {
      const text = await req.text();
      if (text.trim()) body = parseBody(JSON.parse(text));
    } catch {
      return new Response(JSON.stringify({ error: "Invalid JSON body" }), {
        status: 400,
        headers: JSON_HEADERS,
      });
    }

    const brandOffset = body.brand_offset ?? 0;
    const brandLimit = body.brand_limit ?? DEFAULT_BRAND_LIMIT;
    const platforms = body.platforms?.length ? body.platforms : [...PLATFORMS];
    const brandsSlice = WHITELIST_BRANDS.slice(brandOffset, brandOffset + brandLimit);

    if (brandsSlice.length === 0) {
      log.setDetail("no brands in range");
      return new Response(
        JSON.stringify({
          ok: true,
          message: "No brands in range",
          brand_offset: brandOffset,
          total_brands: WHITELIST_BRANDS.length,
        }),
        { status: 200, headers: JSON_HEADERS },
      );
    }

    log.setDetail(`brands ${brandOffset}+${brandsSlice.length}`);

    const supabase = createClient(supabaseUrl, serviceKey);
    const perBrand: Record<string, { inserted: number; skipped: number; errors: string[] }> = {};
    let totalInserted = 0;
    let totalSkipped = 0;

    for (const brand of brandsSlice) {
      const result = await processBrand(supabase, brand, platforms);
      perBrand[brand] = result;
      totalInserted += result.inserted;
      totalSkipped += result.skipped;
    }

    const nextOffset = brandOffset + brandsSlice.length;
    const hasMore = nextOffset < WHITELIST_BRANDS.length;
    if (body.chain && hasMore) {
      chainNextInvocation(body, nextOffset);
    }

    const summary = {
      ok: true,
      brand_offset: brandOffset,
      brand_limit: brandLimit,
      brands_processed: brandsSlice,
      total_brands: WHITELIST_BRANDS.length,
      next_brand_offset: hasMore ? nextOffset : null,
      chained: Boolean(body.chain && hasMore),
      total_inserted: totalInserted,
      total_skipped_duplicates: totalSkipped,
      per_brand: perBrand,
      platforms,
    };

    console.log("[build-whitelist] run complete", JSON.stringify({
      total_inserted: totalInserted,
      brands: brandsSlice.length,
      chained: summary.chained,
    }));

    return new Response(JSON.stringify(summary), {
      status: 200,
      headers: JSON_HEADERS,
    });
  }),
);
