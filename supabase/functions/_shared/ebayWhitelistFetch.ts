/**
 * eBay Finding API — raw sold listings for item_whitelist (up to 100 per brand).
 */
import { ebayAppId } from "./edgeSecrets.ts";

const FINDING_BASE = "https://svcs.ebay.com/services/search/FindingService/v1";
const FINDING_VERSION = "1.13.0";
const FINDING_TIMEOUT_MS = 25_000;
const ENTRIES_PER_PAGE = 100;

export type EbayWhitelistListing = {
  listing_id: string;
  listing_title: string;
  price: number;
  condition: string | null;
  category: string | null;
  listing_url: string | null;
  image_url: string | null;
  date_sold: string | null;
};

function first<T>(v: T | T[] | undefined | null): T | undefined {
  if (v === undefined || v === null) return undefined;
  return Array.isArray(v) ? v[0] : v;
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

function parsePrice(item: Record<string, unknown>): number | null {
  const sellingStatus = first(item.sellingStatus as Record<string, unknown>[] | Record<string, unknown>);
  const currentPrice = sellingStatus
    ? first(sellingStatus.currentPrice as Record<string, unknown>[] | Record<string, unknown>)
    : undefined;
  if (!currentPrice) return null;
  const raw = currentPrice["@__value__"] ?? currentPrice.__value__ ?? currentPrice.value;
  const n = typeof raw === "string" ? parseFloat(raw) : typeof raw === "number" ? raw : NaN;
  if (!Number.isFinite(n) || n <= 0.5 || n > 5000) return null;
  return Math.round(n * 100) / 100;
}

function parseItem(item: Record<string, unknown>): EbayWhitelistListing | null {
  const itemId = String(first(item.itemId as string[] | string) ?? "").trim();
  const title = String(first(item.title as string[] | string) ?? "").trim();
  const price = parsePrice(item);
  if (!itemId || !title || price === null) return null;

  const listingInfo = first(item.listingInfo as Record<string, unknown>[] | Record<string, unknown>);
  const endRaw = listingInfo ? first(listingInfo.endTime as string[] | string) : undefined;
  const date_sold = endRaw ? String(endRaw).trim() || null : null;

  const conditionBlock = first(item.condition as Record<string, unknown>[] | Record<string, unknown>);
  const condition = conditionBlock
    ? String(
      first(conditionBlock.conditionDisplayName as string[] | string) ??
        first(conditionBlock.conditionId as string[] | string) ??
        "",
    ).trim() || null
    : null;

  const primaryCategory = first(
    item.primaryCategory as Record<string, unknown>[] | Record<string, unknown>,
  );
  const category = primaryCategory
    ? String(first(primaryCategory.categoryName as string[] | string) ?? "").trim() || null
    : null;

  const listing_url = String(first(item.viewItemURL as string[] | string) ?? "").trim() || null;
  const gallery = String(first(item.galleryURL as string[] | string) ?? "").trim();
  const picture = String(first(item.pictureURLSuperSize as string[] | string) ?? "").trim();
  const image_url = gallery || picture || null;

  return {
    listing_id: itemId,
    listing_title: title,
    price,
    condition,
    category,
    listing_url,
    image_url,
    date_sold,
  };
}

/** Up to 100 sold GB listings for a brand keyword search. */
export async function fetchEbaySoldListingsForWhitelist(
  brand: string,
): Promise<EbayWhitelistListing[]> {
  const keywords = brand.trim();
  if (!keywords) return [];

  const appId = ebayAppId();
  if (!appId) {
    console.error("[ebayWhitelist] EBAY_APP_ID missing");
    return [];
  }

  const url = buildFindingUrl(keywords, appId);
  console.log("[ebayWhitelist] findCompletedItems", JSON.stringify({ brand, entriesPerPage: ENTRIES_PER_PAGE }));

  let json: Record<string, unknown>;
  try {
    const res = await fetch(url, {
      signal: AbortSignal.timeout(FINDING_TIMEOUT_MS),
      headers: { Accept: "application/json" },
    });
    const text = await res.text();
    if (!res.ok) {
      console.error("[ebayWhitelist] HTTP", res.status, text.slice(0, 300));
      return [];
    }
    json = JSON.parse(text) as Record<string, unknown>;
  } catch (e) {
    console.error("[ebayWhitelist] request failed", e instanceof Error ? e.message : "unknown");
    return [];
  }

  const root = first(
    json.findCompletedItemsResponse as Record<string, unknown>[] | Record<string, unknown>,
  );
  if (!root) return [];

  const ack = String(first(root.ack as string[] | string) ?? "").toLowerCase();
  if (ack && ack !== "success" && ack !== "warning") {
    console.error("[ebayWhitelist] ack failure", ack);
    return [];
  }

  const searchResult = first(
    root.searchResult as Record<string, unknown>[] | Record<string, unknown>,
  );
  const itemsRaw = searchResult?.item;
  const itemArray: Record<string, unknown>[] = itemsRaw
    ? (Array.isArray(itemsRaw) ? itemsRaw : [itemsRaw]) as Record<string, unknown>[]
    : [];

  const out: EbayWhitelistListing[] = [];
  const seen = new Set<string>();
  for (const raw of itemArray) {
    const parsed = parseItem(raw);
    if (!parsed || seen.has(parsed.listing_id)) continue;
    seen.add(parsed.listing_id);
    out.push(parsed);
    if (out.length >= ENTRIES_PER_PAGE) break;
  }

  console.log("[ebayWhitelist] parsed", out.length, "for", brand);
  return out;
}
