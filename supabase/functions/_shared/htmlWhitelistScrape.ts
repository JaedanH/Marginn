/**
 * Vinted / Depop catalog HTML scrape via ScrapingBee (top N listed items per brand).
 */
import { scrapePageHtml } from "./marketVisionScrape.ts";

export type HtmlWhitelistListing = {
  listing_id: string;
  listing_title: string;
  price: number;
  condition: string | null;
  image_url: string | null;
  listing_url: string | null;
};

const MAX_LISTINGS = 50;

function parseGbpPrice(raw: string): number | null {
  const m = raw.match(/£\s*(\d+(?:\.\d{1,2})?)/);
  if (!m) return null;
  const n = parseFloat(m[1]);
  if (!Number.isFinite(n) || n <= 0.5 || n > 5000) return null;
  return Math.round(n * 100) / 100;
}

function decodeHtml(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .trim();
}

/** Vinted UK: /items/{id}-slug */
export function parseVintedCatalogHtml(html: string, limit = MAX_LISTINGS): HtmlWhitelistListing[] {
  if (!html?.trim()) return [];

  const out: HtmlWhitelistListing[] = [];
  const seen = new Set<string>();

  const linkRe = /href="(\/items\/(\d+)(?:-[^"]*)?)"/gi;
  let m: RegExpExecArray | null;
  while ((m = linkRe.exec(html)) !== null && out.length < limit) {
    const path = m[1];
    const id = m[2];
    if (!id || seen.has(id)) continue;

    const start = Math.max(0, m.index - 800);
    const end = Math.min(html.length, m.index + 1200);
    const chunk = html.slice(start, end);

    let title =
      chunk.match(/"title"\s*:\s*"((?:\\.|[^"\\])*)"/i)?.[1] ??
      chunk.match(/data-testid="[^"]*title[^"]*"[^>]*>([^<]{4,120})</i)?.[1] ??
      chunk.match(/alt="([^"]{4,120})"/i)?.[1] ??
      "";
    title = decodeHtml(title.replace(/\\u002F/g, "/").replace(/\\"/g, '"'));
    if (!title || title.length < 3) {
      const slug = path.replace(/^\/items\/\d+-?/, "").replace(/"/g, "");
      title = slug ? decodeHtml(slug.replace(/-/g, " ")) : `Vinted item ${id}`;
    }

    const priceMatch = chunk.match(/£\s*(\d+(?:\.\d{1,2})?)/);
    const price = priceMatch ? parseGbpPrice(`£${priceMatch[1]}`) : null;
    if (price === null) continue;

    const img =
      chunk.match(/(https:\/\/[^"\s]*vinted[^"\s]*\.(?:jpg|jpeg|webp|png)[^"\s]*)/i)?.[1] ??
      chunk.match(/src="(https:\/\/[^"]+\.(?:jpg|jpeg|webp|png)[^"]*)"/i)?.[1] ??
      null;

    seen.add(id);
    out.push({
      listing_id: id,
      listing_title: title.slice(0, 500),
      price,
      condition: null,
      image_url: img,
      listing_url: `https://www.vinted.co.uk${path}`,
    });
  }

  return out.slice(0, limit);
}

/** Depop UK: /products/{slug} — slug ends with numeric id segment. */
export function parseDepopSearchHtml(html: string, limit = MAX_LISTINGS): HtmlWhitelistListing[] {
  if (!html?.trim()) return [];

  const out: HtmlWhitelistListing[] = [];
  const seen = new Set<string>();

  const linkRe = /href="(\/products\/([^"?#]+))"/gi;
  let m: RegExpExecArray | null;
  while ((m = linkRe.exec(html)) !== null && out.length < limit) {
    const path = m[1];
    const slug = m[2];
    if (!slug || slug.length < 3) continue;

    const idMatch = slug.match(/-(\d{6,})$/);
    const id = idMatch ? idMatch[1] : slug;
    if (seen.has(id)) continue;

    const start = Math.max(0, m.index - 800);
    const end = Math.min(html.length, m.index + 1200);
    const chunk = html.slice(start, end);

    let title =
      chunk.match(/"description"\s*:\s*"((?:\\.|[^"\\])*)"/i)?.[1] ??
      chunk.match(/"name"\s*:\s*"((?:\\.|[^"\\])*)"/i)?.[1] ??
      chunk.match(/alt="([^"]{4,120})"/i)?.[1] ??
      "";
    title = decodeHtml(title.replace(/\\u002F/g, "/").replace(/\\"/g, '"'));
    if (!title || title.length < 3) {
      title = decodeHtml(slug.replace(/-\d+$/, "").replace(/-/g, " "));
    }
    if (!title || title.length < 3) continue;

    const priceMatch = chunk.match(/£\s*(\d+(?:\.\d{1,2})?)/);
    const price = priceMatch ? parseGbpPrice(`£${priceMatch[1]}`) : null;
    if (price === null) continue;

    const img =
      chunk.match(/(https:\/\/media-photos\.depop\.com[^"\s]+)/i)?.[1] ??
      chunk.match(/src="(https:\/\/[^"]+depop[^"]+\.(?:jpg|jpeg|webp|png)[^"]*)"/i)?.[1] ??
      null;

    seen.add(id);
    out.push({
      listing_id: id,
      listing_title: title.slice(0, 500),
      price,
      condition: null,
      image_url: img,
      listing_url: `https://www.depop.com${path}`,
    });
  }

  return out.slice(0, limit);
}

export async function fetchVintedListingsForWhitelist(
  searchUrl: string,
  limit = MAX_LISTINGS,
): Promise<HtmlWhitelistListing[]> {
  const html = await scrapePageHtml(searchUrl);
  const listings = parseVintedCatalogHtml(html, limit);
  console.log("[whitelistScrape] vinted parsed", listings.length, "from", searchUrl.slice(0, 80));
  return listings;
}

export async function fetchDepopListingsForWhitelist(
  searchUrl: string,
  limit = MAX_LISTINGS,
): Promise<HtmlWhitelistListing[]> {
  const html = await scrapePageHtml(searchUrl);
  const listings = parseDepopSearchHtml(html, limit);
  console.log("[whitelistScrape] depop parsed", listings.length, "from", searchUrl.slice(0, 80));
  return listings;
}
