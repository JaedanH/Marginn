/**
 * eBay Finding API — findCompletedItems (sold, GB, JSON).
 * Replaces ScrapingBee/HTML/vision for eBay sold comps.
 */
import { MIN_EBAY_SOLD_COMPS_FOR_DISPLAY } from "./ebayCompsTrust.ts";
import { ebayAppId, ebayAppIdDiag } from "./edgeSecrets.ts";
import {
  deriveMarketPrices,
  relevanceScoreForTitle,
  type MarketListing,
  type PlatformMarketResult,
  type PriceExtractionMethod,
} from "./marketVisionScrape.ts";

const FINDING_BASE = "https://svcs.ebay.com/services/search/FindingService/v1";
const FINDING_VERSION = "1.13.0";
const FINDING_TIMEOUT_MS = 20_000;
const ENTRIES_PER_PAGE = 100;

export type EbayFindingFetchArgs = {
  keywords: string;
  brandName: string;
  itemType: string;
};

function first<T>(v: T | T[] | undefined | null): T | undefined {
  if (v === undefined || v === null) return undefined;
  return Array.isArray(v) ? v[0] : v;
}

function parseFindingPrice(item: Record<string, unknown>): number | null {
  const sellingStatus = first(item.sellingStatus as Record<string, unknown>[] | Record<string, unknown>);
  if (!sellingStatus) return null;
  const currentPrice = first(
    sellingStatus.currentPrice as Record<string, unknown>[] | Record<string, unknown>,
  );
  if (!currentPrice) return null;
  const raw = currentPrice["@__value__"] ?? currentPrice.__value__ ?? currentPrice.value;
  const n = typeof raw === "string" ? parseFloat(raw) : typeof raw === "number" ? raw : NaN;
  if (!Number.isFinite(n) || n <= 0.5 || n > 5000) return null;
  const currency = String(currentPrice["@currencyId"] ?? currentPrice.currencyId ?? "GBP").toUpperCase();
  if (currency && currency !== "GBP") {
    console.warn("[ebayFinding] non-GBP sold price", currency, n);
  }
  return Math.round(n * 100) / 100;
}

function parseDaysAgo(item: Record<string, unknown>): number | null {
  const listingInfo = first(item.listingInfo as Record<string, unknown>[] | Record<string, unknown>);
  const endRaw = listingInfo
    ? first(listingInfo.endTime as string[] | string)
    : undefined;
  if (!endRaw) return null;
  const endMs = Date.parse(String(endRaw));
  if (!Number.isFinite(endMs)) return null;
  const days = Math.floor((Date.now() - endMs) / 86_400_000);
  return days >= 0 && days < 400 ? days : null;
}

function parseFindingItem(
  item: Record<string, unknown>,
  brandName: string,
  itemType: string,
): MarketListing | null {
  const title = String(first(item.title as string[] | string) ?? "").trim();
  const price = parseFindingPrice(item);
  if (!title || price === null) return null;

  const gallery = String(first(item.galleryURL as string[] | string) ?? "").trim();
  const picture = String(first(item.pictureURLSuperSize as string[] | string) ?? "").trim();
  const image_url = gallery || picture || "";
  const listing_url = String(first(item.viewItemURL as string[] | string) ?? "").trim();

  return {
    title,
    price,
    image_url,
    listing_url,
    days_ago: parseDaysAgo(item),
    relevance_score: relevanceScoreForTitle(title, brandName, itemType),
  };
}

function buildFindingUrl(keywords: string, appId: string): string {
  const params = new URLSearchParams({
    "OPERATION-NAME": "findCompletedItems",
    "SERVICE-VERSION": FINDING_VERSION,
    "SECURITY-APPNAME": appId,
    "RESPONSE-DATA-FORMAT": "JSON",
    "REST-PAYLOAD": "",
    keywords: keywords.trim(),
    "paginationInput.entriesPerPage": String(ENTRIES_PER_PAGE),
    "paginationInput.pageNumber": "1",
    "GLOBAL-ID": "EBAY-GB",
  });
  params.append("itemFilter(0).name", "SoldItemsOnly");
  params.append("itemFilter(0).value", "true");
  params.append("itemFilter(1).name", "LocatedIn");
  params.append("itemFilter(1).value", "GB");
  return `${FINDING_BASE}?${params.toString()}`;
}

export function emptyEbayFindingResult(): PlatformMarketResult {
  return {
    platform: "ebay",
    prices: [],
    listings: [],
    method: "finding_api" as PriceExtractionMethod,
    soldCount: 0,
    lowConfidence: true,
    averageSoldPrice: null,
  };
}

/**
 * Sold completed listings via Finding API.
 * When fewer than {@link MIN_EBAY_SOLD_COMPS_FOR_DISPLAY} comps: `lowConfidence` true, `prices` empty.
 */
export async function fetchEbaySoldViaFindingApi(
  args: EbayFindingFetchArgs,
): Promise<PlatformMarketResult> {
  const keywords = args.keywords.trim();
  if (!keywords) {
    console.warn("[ebayFinding] empty keywords");
    return emptyEbayFindingResult();
  }

  const appId = ebayAppId();
  if (!appId) {
    console.error("[ebayFinding] EBAY_APP_ID missing — set Supabase Edge secret");
    return emptyEbayFindingResult();
  }

  const url = buildFindingUrl(keywords, appId);
  console.log(
    "[ebayFinding] findCompletedItems",
    JSON.stringify({
      keywords: keywords.slice(0, 80),
      app_prefix8: ebayAppIdDiag().prefix8,
      entriesPerPage: ENTRIES_PER_PAGE,
    }),
  );

  let json: Record<string, unknown>;
  try {
    const res = await fetch(url, {
      signal: AbortSignal.timeout(FINDING_TIMEOUT_MS),
      headers: { Accept: "application/json" },
    });
    const text = await res.text();
    if (!res.ok) {
      console.error("[ebayFinding] HTTP", res.status, text.slice(0, 300));
      return emptyEbayFindingResult();
    }
    json = JSON.parse(text) as Record<string, unknown>;
  } catch (e) {
    console.error("[ebayFinding] request failed", e instanceof Error ? e.message : "unknown");
    return emptyEbayFindingResult();
  }

  const root = first(
    json.findCompletedItemsResponse as Record<string, unknown>[] | Record<string, unknown>,
  );
  if (!root) {
    console.warn("[ebayFinding] missing findCompletedItemsResponse");
    return emptyEbayFindingResult();
  }

  const ack = String(first(root.ack as string[] | string) ?? "").toLowerCase();
  if (ack && ack !== "success" && ack !== "warning") {
    const errors = root.errorMessage;
    console.error("[ebayFinding] ack failure", ack, JSON.stringify(errors).slice(0, 400));
    return emptyEbayFindingResult();
  }

  const pagination = first(
    root.paginationOutput as Record<string, unknown>[] | Record<string, unknown>,
  );
  const totalEntriesRaw = pagination
    ? first(pagination.totalEntries as string[] | string)
    : undefined;
  const totalEntries = totalEntriesRaw != null ? parseInt(String(totalEntriesRaw), 10) : 0;

  const searchResult = first(
    root.searchResult as Record<string, unknown>[] | Record<string, unknown>,
  );
  const itemsRaw = searchResult?.item;
  const itemArray: Record<string, unknown>[] = itemsRaw
    ? (Array.isArray(itemsRaw) ? itemsRaw : [itemsRaw]) as Record<string, unknown>[]
    : [];

  const listings: MarketListing[] = [];
  for (const raw of itemArray) {
    const parsed = parseFindingItem(raw, args.brandName, args.itemType);
    if (parsed) listings.push(parsed);
  }

  listings.sort((a, b) => b.relevance_score - a.relevance_score);

  const soldCount = Math.max(
    listings.length,
    Number.isFinite(totalEntries) ? totalEntries : 0,
  );
  const lowConfidence = soldCount < MIN_EBAY_SOLD_COMPS_FOR_DISPLAY;

  const rawPrices = listings.map((l) => l.price);
  const filteredPrices = deriveMarketPrices(rawPrices);
  const averageSoldPrice =
    filteredPrices.length > 0
      ? Math.round(filteredPrices.reduce((a, b) => a + b, 0) / filteredPrices.length)
      : null;

  // Keep parsed prices for resale + comparables even when below display threshold.
  const prices = filteredPrices;

  console.log(
    "[ebayFinding] results",
    JSON.stringify({
      itemsParsed: listings.length,
      totalEntries,
      soldCount,
      lowConfidence,
      pricePoints: prices.length,
      averageSoldPrice,
    }),
  );

  return {
    platform: "ebay",
    prices,
    listings: listings.slice(0, 24),
    method: "finding_api",
    soldCount,
    lowConfidence,
    averageSoldPrice,
  };
}
