/**
 * eBay Browse API — item_summary/search (active GB listings, GBP).
 * Replaces the decommissioned Finding API (findCompletedItems died 2025-02-05).
 * NOTE: returns ACTIVE listing (asking) prices, used as resale estimates — not sold prices.
 * Requires Edge secrets EBAY_APP_ID + EBAY_CERT_ID (OAuth client-credentials).
 */
import { MIN_EBAY_SOLD_COMPS_FOR_DISPLAY } from "./ebayCompsTrust.ts";
import { ebayAppId, ebayCertId } from "./edgeSecrets.ts";
import {
  deriveMarketPrices,
  relevanceScoreForTitle,
  type MarketListing,
  type PlatformMarketResult,
  type PriceExtractionMethod,
} from "./marketVisionScrape.ts";

const OAUTH_URL = "https://api.ebay.com/identity/v1/oauth2/token";
const BROWSE_SEARCH_URL = "https://api.ebay.com/buy/browse/v1/item_summary/search";
const OAUTH_SCOPE = "https://api.ebay.com/oauth/api_scope";
const BROWSE_TIMEOUT_MS = 18_000;
const SEARCH_LIMIT = 50;

export type EbayBrowseFetchArgs = {
  keywords: string;
  brandName: string;
  itemType: string;
};

export function emptyEbayBrowseResult(): PlatformMarketResult {
  return {
    platform: "ebay",
    prices: [],
    listings: [],
    method: "browse_api" as PriceExtractionMethod,
    soldCount: 0,
    lowConfidence: true,
    averageSoldPrice: null,
  };
}

/** Module-scope token cache (edge isolates live long enough for this to matter). */
let cachedToken: { value: string; expiresAtMs: number } | null = null;

async function getAppToken(): Promise<string | null> {
  if (cachedToken && Date.now() < cachedToken.expiresAtMs - 60_000) {
    return cachedToken.value;
  }
  const appId = ebayAppId();
  const certId = ebayCertId();
  if (!appId || !certId) {
    console.error(
      "[ebayBrowse] EBAY_APP_ID and/or EBAY_CERT_ID missing — set Supabase Edge secrets",
    );
    return null;
  }
  try {
    const res = await fetch(OAUTH_URL, {
      method: "POST",
      signal: AbortSignal.timeout(BROWSE_TIMEOUT_MS),
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Authorization: `Basic ${btoa(`${appId}:${certId}`)}`,
      },
      body: new URLSearchParams({
        grant_type: "client_credentials",
        scope: OAUTH_SCOPE,
      }),
    });
    const json = (await res.json()) as Record<string, unknown>;
    if (!res.ok || typeof json.access_token !== "string") {
      console.error("[ebayBrowse] OAuth failed", res.status, JSON.stringify(json).slice(0, 300));
      return null;
    }
    const expiresInSec = typeof json.expires_in === "number" ? json.expires_in : 7200;
    cachedToken = {
      value: json.access_token,
      expiresAtMs: Date.now() + expiresInSec * 1000,
    };
    return cachedToken.value;
  } catch (e) {
    console.error("[ebayBrowse] OAuth request failed", e instanceof Error ? e.message : "unknown");
    return null;
  }
}

function parseBrowseItem(
  item: Record<string, unknown>,
  brandName: string,
  itemType: string,
): MarketListing | null {
  const title = String(item.title ?? "").trim();
  const priceObj = item.price as Record<string, unknown> | undefined;
  const raw = priceObj?.value;
  const n = typeof raw === "string" ? parseFloat(raw) : typeof raw === "number" ? raw : NaN;
  if (!title || !Number.isFinite(n) || n <= 0.5 || n > 5000) return null;
  const currency = String(priceObj?.currency ?? "GBP").toUpperCase();
  if (currency !== "GBP") return null;

  const image = item.image as Record<string, unknown> | undefined;
  const thumbs = item.thumbnailImages as Record<string, unknown>[] | undefined;
  const image_url = String(image?.imageUrl ?? thumbs?.[0]?.imageUrl ?? "").trim();
  const listing_url = String(item.itemWebUrl ?? "").trim();

  return {
    title,
    price: Math.round(n * 100) / 100,
    image_url,
    listing_url,
    // Active listings have no sold date; velocity stays unknown.
    days_ago: null,
    relevance_score: relevanceScoreForTitle(title, brandName, itemType),
  };
}

/**
 * Active GB listings via Browse API as price estimates.
 * When fewer than {@link MIN_EBAY_SOLD_COMPS_FOR_DISPLAY} comps: `lowConfidence` true.
 */
export async function fetchEbayActiveViaBrowseApi(
  args: EbayBrowseFetchArgs,
): Promise<PlatformMarketResult> {
  const keywords = args.keywords.trim();
  if (!keywords) {
    console.warn("[ebayBrowse] empty keywords");
    return emptyEbayBrowseResult();
  }

  const token = await getAppToken();
  if (!token) return emptyEbayBrowseResult();

  const params = new URLSearchParams({
    q: keywords,
    limit: String(SEARCH_LIMIT),
    filter: "itemLocationCountry:GB,priceCurrency:GBP,buyingOptions:{FIXED_PRICE|AUCTION}",
  });
  console.log(
    "[ebayBrowse] item_summary/search",
    JSON.stringify({ keywords: keywords.slice(0, 80), limit: SEARCH_LIMIT }),
  );

  let json: Record<string, unknown>;
  try {
    const res = await fetch(`${BROWSE_SEARCH_URL}?${params.toString()}`, {
      signal: AbortSignal.timeout(BROWSE_TIMEOUT_MS),
      headers: {
        Authorization: `Bearer ${token}`,
        "X-EBAY-C-MARKETPLACE-ID": "EBAY_GB",
        Accept: "application/json",
      },
    });
    const text = await res.text();
    if (!res.ok) {
      console.error("[ebayBrowse] HTTP", res.status, text.slice(0, 300));
      return emptyEbayBrowseResult();
    }
    json = JSON.parse(text) as Record<string, unknown>;
  } catch (e) {
    console.error("[ebayBrowse] request failed", e instanceof Error ? e.message : "unknown");
    return emptyEbayBrowseResult();
  }

  const itemsRaw = (json.itemSummaries as Record<string, unknown>[] | undefined) ?? [];
  const listings: MarketListing[] = [];
  for (const raw of itemsRaw) {
    const parsed = parseBrowseItem(raw, args.brandName, args.itemType);
    if (parsed) listings.push(parsed);
  }
  listings.sort((a, b) => b.relevance_score - a.relevance_score);

  const total = typeof json.total === "number" ? json.total : 0;
  const compCount = Math.max(listings.length, Number.isFinite(total) ? Math.min(total, 500) : 0);
  const lowConfidence = compCount < MIN_EBAY_SOLD_COMPS_FOR_DISPLAY;

  const filteredPrices = deriveMarketPrices(listings.map((l) => l.price));
  const averagePrice = filteredPrices.length > 0
    ? Math.round(filteredPrices.reduce((a, b) => a + b, 0) / filteredPrices.length)
    : null;

  console.log(
    "[ebayBrowse] results",
    JSON.stringify({
      itemsParsed: listings.length,
      total,
      compCount,
      lowConfidence,
      pricePoints: filteredPrices.length,
      averagePrice,
    }),
  );

  return {
    platform: "ebay",
    prices: filteredPrices,
    listings: listings.slice(0, 24),
    method: "browse_api",
    soldCount: compCount,
    lowConfidence,
    averageSoldPrice: averagePrice,
  };
}
