/**
 * Vinted/Depop: ScrapingBee screenshot + Claude vision, HTML regex fallback.
 * eBay sold comps: use `ebayFindingApi.ts` (Finding API) via `extractPlatformMarketData`.
 */
import {
  anthropicKeyOptional,
  scrapingBeeKey,
  scrapingBeeKeyDiag,
  scrapingBeeKeySource,
} from "./edgeSecrets.ts";

const ANTHROPIC_API_URL = "https://api.anthropic.com/v1/messages";
const VISION_MODEL = "claude-sonnet-4-20250514";
const SCRAPE_TIMEOUT_MS = 18_000;

export type PriceExtractionMethod = "vision" | "regex_fallback" | "finding_api";

export interface MarketListing {
  title: string;
  price: number;
  image_url: string;
  listing_url: string;
  days_ago: number | null;
  condition?: string;
  relevance_score: number;
}

export interface PlatformMarketResult {
  platform: "ebay" | "vinted" | "depop";
  prices: number[];
  listings: MarketListing[];
  method: PriceExtractionMethod;
  soldCount: number;
  /** eBay Finding API: fewer than min sold comps — do not use averageSoldPrice for pricing. */
  lowConfidence?: boolean;
  averageSoldPrice?: number | null;
}

/** Prefer outlier-filtered prices; if filtering removes everything, keep valid raw prices. */
export function deriveMarketPrices(rawPrices: number[]): number[] {
  const valid = rawPrices.filter((p) => Number.isFinite(p) && p > 0.5 && p < 5000);
  if (valid.length === 0) return [];
  const filtered = filterOutliers(valid);
  return filtered.length > 0 ? filtered : valid;
}

export function filterOutliers(prices: number[]): number[] {
  if (prices.length === 0) return [];
  const floored = prices.filter((p) => p >= 2);
  if (floored.length === 0) return [];
  if (floored.length === 1) return floored;
  const rawAvg = floored.reduce((a, b) => a + b, 0) / floored.length;
  const firstPass = floored.filter((p) => p >= rawAvg * 0.2 && p <= rawAvg * 3);
  if (firstPass.length === 0) return floored;
  const cleanAvg = firstPass.reduce((a, b) => a + b, 0) / firstPass.length;
  const secondPass = firstPass.filter((p) => p >= cleanAvg * 0.25 && p <= cleanAvg * 2.5);
  return secondPass.length > 0 ? secondPass : firstPass;
}

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

function logScrapingBeeAuthFailure(context: string, status: number, body: string): void {
  const diag = scrapingBeeKeyDiag();
  console.warn(
    `[marketVision] ScrapingBee ${context} auth/status ${status}`,
    JSON.stringify({
      key_source: scrapingBeeKeySource(),
      key_prefix8: diag.prefix8,
      key_len: diag.length,
      body_snip: body.slice(0, 200),
    }),
  );
}

/** ScrapingBee HTML fetch — shared by market vision and whitelist builders. */
export async function scrapePageHtml(targetUrl: string): Promise<string> {
  const key = scrapingBeeKey();
  if (!key) {
    console.warn("[marketVision] SCRAPINGBEE_API_KEY missing — skip HTML scrape");
    return "";
  }
  const params = new URLSearchParams({
    api_key: key,
    url: targetUrl,
    render_js: "false",
    premium_proxy: "false",
    block_ads: "true",
    timeout: String(SCRAPE_TIMEOUT_MS),
  });
  const res = await fetch(`https://app.scrapingbee.com/api/v1/?${params.toString()}`, {
    signal: AbortSignal.timeout(SCRAPE_TIMEOUT_MS + 3_000),
  });
  if (!res.ok) {
    const errText = await res.text();
    if (res.status === 401) logScrapingBeeAuthFailure("html", res.status, errText);
    else console.warn("[marketVision] HTML scrape failed", res.status, errText.slice(0, 120));
    return "";
  }
  return await res.text();
}

async function scrapeScreenshot(
  targetUrl: string,
  screenshotSelector: string | undefined,
): Promise<string | null> {
  const key = scrapingBeeKey();
  if (!key) {
    console.warn("[marketVision] SCRAPINGBEE_API_KEY missing — skip screenshot");
    return null;
  }
  const params = new URLSearchParams({
    api_key: key,
    url: targetUrl,
    render_js: "false",
    premium_proxy: "false",
    screenshot: "true",
    screenshot_full_page: "false",
    timeout: String(SCRAPE_TIMEOUT_MS),
  });
  if (screenshotSelector?.trim()) {
    params.set("screenshot_selector", screenshotSelector.trim());
  }
  const res = await fetch(`https://app.scrapingbee.com/api/v1/?${params.toString()}`, {
    signal: AbortSignal.timeout(SCRAPE_TIMEOUT_MS + 5_000),
  });
  if (!res.ok) {
    const errText = await res.text();
    if (res.status === 401) {
      logScrapingBeeAuthFailure(`screenshot:${screenshotSelector ?? "viewport"}`, res.status, errText);
    } else {
      console.warn(
        "[marketVision] screenshot failed",
        res.status,
        screenshotSelector ?? "viewport",
        errText.slice(0, 120),
      );
    }
    return null;
  }
  const ct = (res.headers.get("content-type") ?? "").toLowerCase();
  if (!ct.includes("image") && !ct.includes("octet-stream")) {
    const text = await res.text();
    console.warn("[marketVision] screenshot not image, len", text.length);
    return null;
  }
  return arrayBufferToBase64(await res.arrayBuffer());
}

function visionPromptForPlatform(platform: "vinted" | "depop"): string {
  const site =
    platform === "vinted"
      ? "Vinted UK catalog search results"
      : "Depop UK search results (used items)";
  return `You are a precise data extraction AI. This is a screenshot of ${site}. Extract every visible listing and return ONLY this JSON with no other text:
{
  "listings": [
    {
      "title": "exact item title",
      "price": 0,
      "condition": "condition grade if visible or empty string",
      "days_ago": null,
      "image_url": ""
    }
  ]
}
Rules:
- price must be the item sold/listing price in GBP as a number only (no £ symbol). Ignore shipping-only lines.
- days_ago: integer days since sold if shown, else null.
- Only include rows with a clear GBP item price. Ignore promoted/sponsored slots without a real price.
- If no listings are visible, return "listings": [].`;
}

async function extractListingsFromScreenshot(
  screenshotBase64: string,
  platform: "vinted" | "depop",
): Promise<MarketListing[]> {
  const key = anthropicKeyOptional();
  if (!key) {
    console.warn("[marketVision] ANTHROPIC_API_KEY missing — skip vision extraction");
    return [];
  }

  const res = await fetch(ANTHROPIC_API_URL, {
    method: "POST",
    headers: {
      "x-api-key": key,
      "anthropic-version": "2023-06-01",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: VISION_MODEL,
      max_tokens: 2048,
      messages: [
        {
          role: "user",
          content: [
            {
              type: "image",
              source: { type: "base64", media_type: "image/png", data: screenshotBase64 },
            },
            { type: "text", text: visionPromptForPlatform(platform) },
          ],
        },
      ],
    }),
    signal: AbortSignal.timeout(45_000),
  });

  if (!res.ok) {
    console.warn("[marketVision] Claude vision failed", platform, res.status);
    return [];
  }

  const data = await res.json();
  const rawText = data?.content?.[0]?.text ?? "";
  return parseVisionListingsJson(rawText);
}

function parseVisionListingsJson(rawText: string): MarketListing[] {
  try {
    let cleaned = rawText.replace(/```json\s*/gi, "").replace(/```\s*/g, "").trim();
    const first = cleaned.indexOf("{");
    const last = cleaned.lastIndexOf("}");
    if (first !== -1 && last > first) cleaned = cleaned.slice(first, last + 1);
    const parsed = JSON.parse(cleaned) as { listings?: unknown[] };
    if (!Array.isArray(parsed.listings)) return [];
    const out: MarketListing[] = [];
    for (const row of parsed.listings) {
      if (!row || typeof row !== "object") continue;
      const o = row as Record<string, unknown>;
      const title = String(o.title ?? "").trim();
      const price = Number(o.price);
      if (!title || !Number.isFinite(price) || price <= 0 || price > 5000) continue;
      const daysRaw = o.days_ago;
      let days_ago: number | null = null;
      if (typeof daysRaw === "number" && Number.isFinite(daysRaw) && daysRaw >= 0 && daysRaw < 400) {
        days_ago = Math.round(daysRaw);
      }
      out.push({
        title,
        price: Math.round(price * 100) / 100,
        image_url: String(o.image_url ?? "").trim(),
        listing_url: "",
        days_ago,
        condition: String(o.condition ?? "").trim() || undefined,
        relevance_score: 0,
      });
    }
    return out;
  } catch (e) {
    console.warn("[marketVision] parse vision JSON failed", e instanceof Error ? e.message : "unknown");
    return [];
  }
}

export function relevanceScoreForTitle(
  title: string,
  brandName: string,
  itemType: string,
): number {
  const t = title.toLowerCase();
  let score = 0;
  const brandTokens = brandName.toLowerCase().split(/[\s/]+/).filter((w) => w.length > 2);
  for (const w of brandTokens) {
    if (t.includes(w)) score += 0.28;
  }
  const item = itemType.trim().toLowerCase();
  if (item && item !== "unknown" && t.includes(item)) score += 0.32;
  if (/\b(nike|adidas|stone island|supreme|ralph|carhartt)\b/i.test(t) && brandTokens.some((w) => t.includes(w))) {
    score += 0.1;
  }
  return Math.min(1, Math.round(score * 1000) / 1000);
}

function applyRelevance(listings: MarketListing[], brandName: string, itemType: string): MarketListing[] {
  return listings.map((l) => ({
    ...l,
    relevance_score: relevanceScoreForTitle(l.title, brandName, itemType),
  }));
}

function regexVinted(html: string): number[] {
  const rawPrices: number[] = [];
  const priceRegex = /£\s*(\d+(?:\.\d{1,2})?)/g;
  let m: RegExpExecArray | null;
  while ((m = priceRegex.exec(html)) !== null) {
    const v = parseFloat(m[1]);
    if (v > 0.5 && v < 5000) rawPrices.push(v);
  }
  return deriveMarketPrices(rawPrices);
}

function regexDepop(html: string): number[] {
  return regexVinted(html);
}

const PLATFORM_SCREENSHOT_SELECTORS: Record<
  "vinted" | "depop",
  string[]
> = {
  vinted: [".feed-grid"],
  depop: [".sc-eDnWTT", "[data-testid='product-grid']", ".styles_productGrid__"],
};

function keywordsFromEbaySearchUrl(searchUrl: string): string {
  try {
    const u = new URL(searchUrl);
    return decodeURIComponent(u.searchParams.get("_nkw") ?? "").trim();
  } catch {
    return "";
  }
}

/**
 * eBay: Finding API `findCompletedItems`. Vinted/Depop: ScrapingBee vision + HTML fallback.
 */
export async function extractPlatformMarketData(args: {
  platform: "ebay" | "vinted" | "depop";
  searchUrl: string;
  brandName: string;
  itemType: string;
  /** eBay Finding API keywords (preferred over parsing `searchUrl`). */
  searchKeywords?: string;
}): Promise<PlatformMarketResult> {
  const { platform, searchUrl, brandName, itemType } = args;

  if (platform === "ebay") {
    const keywords = (args.searchKeywords ?? keywordsFromEbaySearchUrl(searchUrl)).trim();
    const { fetchEbaySoldViaFindingApi } = await import("./ebayFindingApi.ts");
    return await fetchEbaySoldViaFindingApi({
      keywords,
      brandName,
      itemType,
    });
  }

  const selectors = PLATFORM_SCREENSHOT_SELECTORS[platform];

  let screenshotB64: string | null = null;
  for (const sel of selectors) {
    screenshotB64 = await scrapeScreenshot(searchUrl, sel);
    if (screenshotB64) break;
  }
  if (!screenshotB64) {
    screenshotB64 = await scrapeScreenshot(searchUrl, undefined);
  }

  if (screenshotB64) {
    let listings = applyRelevance(
      await extractListingsFromScreenshot(screenshotB64, platform),
      brandName,
      itemType,
    );
    if (listings.length > 0) {
      const prices = deriveMarketPrices(listings.map((l) => l.price));
      const soldCount = listings.filter((l) => l.days_ago !== null && l.days_ago <= 30).length;
      return {
        platform,
        prices,
        listings: listings.slice(0, 12),
        method: "vision",
        soldCount: soldCount || listings.length,
      };
    }
    console.log(`[marketVision] ${platform}: vision returned 0 listings, regex fallback`);
  } else {
    console.log(`[marketVision] ${platform}: screenshot failed, regex fallback`);
  }

  const html = await scrapePageHtml(searchUrl);
  const prices =
    platform === "vinted" ? regexVinted(html) : regexDepop(html);
  return {
    platform,
    prices,
    listings: [],
    method: "regex_fallback",
    soldCount: 0,
  };
}
