/**
 * AI Comparable Finder — text-only scoring across eBay / Vinted / Depop listings.
 */
import type { MarketListing } from "./marketVisionScrape.ts";

export type ComparablePlatform = "ebay" | "vinted" | "depop";

export interface ItemDetails {
  brand: string;
  type: string;
  colour: string;
  condition: string;
  size: string;
}

export interface ComparableListing {
  id: string;
  platform: ComparablePlatform;
  title: string;
  price: number;
  /** ISO date when sold/listed if known */
  date_at: string | null;
  days_ago: number | null;
  match_percent: number;
  url: string;
}

export interface PlatformComparablesSlice {
  top5: ComparableListing[];
  strong_match_count: number;
  low_confidence: boolean;
}

export interface FindBestComparablesResult {
  ebay: PlatformComparablesSlice;
  vinted: PlatformComparablesSlice;
  depop: PlatformComparablesSlice;
  all_passing: ComparableListing[];
  average_price: number | null;
  overall_confidence: number;
  /** Context for client M-Score recalc after user removals */
  m_score_recalc?: {
    sold_last7: number;
    sold_last30: number;
    live_listings: number;
    net_profit: number;
    brand_tier: string;
    condition_grade: string;
    item_type: string;
    brand_confidence: number;
    buy_price: number;
    month: number;
  };
}

export interface FindBestComparablesDiscard {
  item_brand: string;
  item_type: string;
  discarded_listing_title: string;
  discarded_price: number | null;
  match_score: number;
  platform: ComparablePlatform;
}

const MIN_MATCH = 0.55;
const MIN_MATCH_UNKNOWN_BRAND = 0.5;
const STRONG_MATCH = 0.75;
const MIN_STRONG_FOR_AVG = 3;
const RECENCY_WINDOW_DAYS = 90;
const FALLBACK_MIN_SCORE = 0.35;

const BRAND_ALIASES: Record<string, string[]> = {
  "carhartt wip": ["carhartt", "wip"],
  "ralph lauren": ["polo", "rl"],
  "stone island": ["stoney", "si"],
  "north face": ["tnf", "the north face"],
};

const CONDITION_TERMS: Record<string, string[]> = {
  LIKE_NEW: ["like new", "bnwt", "brand new", "new with tags", "unworn", "mint", "nwt"],
  GOOD: ["good", "excellent", "vgc", "very good", "great condition"],
  LIGHT_WEAR: ["light wear", "worn once", "lightly worn", "minor wear"],
  FADED: ["faded", "fade", "sun faded"],
  CRACKED_LOGO: ["cracked logo", "logo crack", "peeling logo"],
  STAINS: ["stain", "stained", "mark", "spot"],
  HEAVY_WEAR: ["heavy wear", "well worn", "distressed", "beat up", "damaged", "hole", "rip"],
};

const TYPE_SYNONYMS: Record<string, string[]> = {
  hoodie: ["hoodie", "hoody", "pullover", "sweatshirt"],
  jacket: ["jacket", "coat", "parka", "bomber", "windbreaker", "gilet"],
  trainers: ["trainer", "sneaker", "shoe", "footwear"],
  tshirt: ["t-shirt", "tee", "t shirt"],
  jeans: ["jean", "denim", "trouser", "pant"],
  shirt: ["shirt", "oxford", "button down", "polo"],
};

const COLOUR_GROUPS: Record<string, string[]> = {
  black: ["black", "blk", "noir"],
  white: ["white", "cream", "off white", "ivory"],
  navy: ["navy", "dark blue"],
  blue: ["blue", "cobalt", "royal"],
  grey: ["grey", "gray", "charcoal", "heather"],
  green: ["green", "olive", "khaki", "sage"],
  red: ["red", "burgundy", "maroon", "wine"],
  brown: ["brown", "tan", "beige", "camel"],
  pink: ["pink", "rose"],
  yellow: ["yellow", "mustard"],
  orange: ["orange", "rust"],
  purple: ["purple", "lilac", "violet"],
};

function norm(s: string): string {
  return s
    .toLowerCase()
    .replace(/['']/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function brandForMatching(brand: string): string {
  let b = String(brand ?? "").trim();
  b = b.replace(/\s*\(\s*brand unclear\s*\)\s*$/i, "").trim();
  return b;
}

function isUnknownBrand(brand: string): boolean {
  const b = norm(brandForMatching(brand));
  return !b || b === "unknown" || b === "unknown brand" || b === "n/a" || b === "none";
}

function minMatchThreshold(item: ItemDetails): number {
  return isUnknownBrand(item.brand) ? MIN_MATCH_UNKNOWN_BRAND : MIN_MATCH;
}

function tokens(s: string): string[] {
  return norm(s).split(" ").filter((w) => w.length > 1);
}

function stableId(platform: ComparablePlatform, title: string, price: number, url: string): string {
  const key = `${platform}|${norm(title)}|${price}|${url}`;
  let h = 2166136261;
  for (let i = 0; i < key.length; i++) {
    h ^= key.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return `${platform}-${(h >>> 0).toString(16)}`;
}

function brandScore(title: string, brand: string): number {
  const t = norm(title);
  const b = norm(brandForMatching(brand));
  if (!b || b === "unknown" || b === "unknown brand") return 0.5;
  if (t.includes(b)) return 1;
  const brandToks = tokens(b);
  let hits = 0;
  for (const tok of brandToks) {
    if (tok.length > 2 && t.includes(tok)) hits += 1;
  }
  if (brandToks.length > 0 && hits >= Math.min(brandToks.length, 2)) return 0.92;
  if (hits > 0) return 0.75 + 0.08 * hits;
  const aliases = BRAND_ALIASES[b];
  if (aliases?.some((a) => t.includes(a))) return 0.88;
  for (const [canonical, als] of Object.entries(BRAND_ALIASES)) {
    if (b.includes(canonical) || canonical.includes(b)) {
      if (als.some((a) => t.includes(a))) return 0.85;
    }
  }
  return hits > 0 ? 0.7 : 0.2;
}

function typeScore(title: string, itemType: string): number {
  const t = norm(title);
  const it = norm(itemType);
  if (!it || it === "unknown") return 0.5;
  if (t.includes(it)) return 1;
  for (const [key, syns] of Object.entries(TYPE_SYNONYMS)) {
    if (it.includes(key) || key.includes(it)) {
      if (syns.some((s) => t.includes(s))) return 0.95;
    }
  }
  const typeToks = tokens(itemType);
  let hits = 0;
  for (const tok of typeToks) {
    if (tok.length > 3 && t.includes(tok)) hits += 1;
  }
  if (hits >= 2) return 0.9;
  if (hits === 1) return 0.72;
  return 0.35;
}

function conditionScore(title: string, listingCondition: string | undefined, target: string): number {
  const t = `${norm(title)} ${norm(listingCondition ?? "")}`;
  const grade = target.toUpperCase().replace(/\s+/g, "_");
  const terms = CONDITION_TERMS[grade] ?? CONDITION_TERMS.GOOD ?? [];
  if (terms.some((term) => t.includes(term))) return 1;
  const order = [
    "LIKE_NEW",
    "GOOD",
    "LIGHT_WEAR",
    "FADED",
    "CRACKED_LOGO",
    "STAINS",
    "HEAVY_WEAR",
  ];
  const idx = order.indexOf(grade as (typeof order)[number]);
  if (idx === -1) return 0.55;
  for (let d = 1; d <= 2; d++) {
    const near = order[idx - d] ?? order[idx + d];
    if (!near) continue;
    const nearTerms = CONDITION_TERMS[near] ?? [];
    if (nearTerms.some((term) => t.includes(term))) return 0.78 - d * 0.08;
  }
  return 0.45;
}

function colourScore(title: string, colour: string): number {
  const c = norm(colour);
  if (!c || c === "unknown" || c === "multi") return 0.55;
  const t = norm(title);
  const colourToks = tokens(colour);
  for (const tok of colourToks) {
    if (tok.length > 2 && t.includes(tok)) return 1;
  }
  for (const [, group] of Object.entries(COLOUR_GROUPS)) {
    const inTarget = group.some((g) => c.includes(g) || colourToks.some((ct) => ct.includes(g)));
    const inTitle = group.some((g) => t.includes(g));
    if (inTarget && inTitle) return 0.92;
  }
  return 0.35;
}

function recencyScore(daysAgo: number | null): number {
  if (daysAgo === null || !Number.isFinite(daysAgo)) return 0.55;
  if (daysAgo <= 7) return 1;
  if (daysAgo <= RECENCY_WINDOW_DAYS) {
    return 1 - (daysAgo / RECENCY_WINDOW_DAYS) * 0.35;
  }
  return 0.25;
}

function sizeScore(title: string, size: string): number {
  const s = norm(size);
  if (!s || s === "unknown" || s === "one size") return 0.6;
  const t = norm(title);
  if (t.includes(s)) return 1;
  const m = s.match(/\b(xs|s|m|l|xl|xxl|xxxl|\d{2})\b/);
  if (m && t.includes(m[1])) return 0.9;
  return 0.5;
}

function scoreListing(
  listing: MarketListing,
  platform: ComparablePlatform,
  item: ItemDetails,
): { score: number; listing: ComparableListing } {
  const brandS = brandScore(listing.title, item.brand);
  const typeS = typeScore(listing.title, item.type);
  const condS = conditionScore(listing.title, listing.condition, item.condition);
  const colourS = colourScore(listing.title, item.colour);
  const recencyS = recencyScore(listing.days_ago);
  const sizeS = sizeScore(listing.title, item.size);

  let score =
    brandS * 0.28 +
    typeS * 0.24 +
    condS * 0.16 +
    colourS * 0.14 +
    recencyS * 0.12 +
    sizeS * 0.06;

  if (listing.relevance_score > 0) {
    score = score * 0.88 + listing.relevance_score * 0.12;
  }

  const rounded = Math.round(score * 1000) / 1000;
  const dateAt =
    listing.days_ago != null && Number.isFinite(listing.days_ago)
      ? new Date(Date.now() - listing.days_ago * 86_400_000).toISOString()
      : null;

  return {
    score: rounded,
    listing: {
      id: stableId(platform, listing.title, listing.price, listing.listing_url),
      platform,
      title: listing.title,
      price: listing.price,
      date_at: dateAt,
      days_ago: listing.days_ago,
      match_percent: Math.round(rounded * 100),
      url: listing.listing_url,
    },
  };
}

function median(nums: number[]): number {
  if (nums.length === 0) return 0;
  const sorted = [...nums].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 !== 0
    ? sorted[mid]!
    : Math.round((sorted[mid - 1]! + sorted[mid]!) / 2);
}

function slicePlatform(
  scored: Array<{ score: number; listing: ComparableListing }>,
  minMatch: number,
): PlatformComparablesSlice {
  const sorted = [...scored].sort(
    (a, b) => b.score - a.score || a.listing.price - b.listing.price,
  );
  const passing = sorted.filter((s) => s.score >= minMatch);
  const strong = passing.filter((s) => s.score >= STRONG_MATCH);
  let top5 = passing.slice(0, 5).map((s) => s.listing);

  if (top5.length === 0 && sorted.length > 0) {
    top5 = sorted
      .filter((s) => s.score >= FALLBACK_MIN_SCORE)
      .slice(0, 5)
      .map((s) => s.listing);
  }

  // Last resort: show best-scored raw rows so UI is not empty when marketplace returned listings.
  if (top5.length === 0 && sorted.length > 0) {
    top5 = sorted.slice(0, 5).map((s) => s.listing);
  }

  return {
    top5,
    strong_match_count: strong.length,
    low_confidence: strong.length < MIN_STRONG_FOR_AVG,
  };
}

function computeAveragePrice(slices: PlatformComparablesSlice[]): number | null {
  const prices: number[] = [];
  for (const slice of slices) {
    if (slice.low_confidence) continue;
    for (const row of slice.top5) {
      if (Number.isFinite(row.price) && row.price > 0) prices.push(row.price);
    }
  }
  if (prices.length === 0) return null;
  return median(prices);
}

function overallConfidenceScore(
  slices: PlatformComparablesSlice[],
  allPassing: ComparableListing[],
): number {
  const strongTotal = slices.reduce((n, s) => n + s.strong_match_count, 0);
  const topMatches = allPassing
    .slice(0, 15)
    .map((l) => l.match_percent);
  const avgMatch =
    topMatches.length > 0
      ? topMatches.reduce((a, b) => a + b, 0) / topMatches.length
      : 0;
  const coverage = Math.min(1, strongTotal / 9);
  return Math.round(clamp(coverage * 35 + (avgMatch / 100) * 65, 0, 100));
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, n));
}

function collectDiscards(
  item: ItemDetails,
  platform: ComparablePlatform,
  raw: MarketListing[],
  passingIds: Set<string>,
): FindBestComparablesDiscard[] {
  const out: FindBestComparablesDiscard[] = [];
  for (const row of raw) {
    const { score, listing } = scoreListing(row, platform, item);
    if (score >= minMatchThreshold(item) || passingIds.has(listing.id)) continue;
    if (score < 0.45) continue;
    out.push({
      item_brand: item.brand,
      item_type: item.type,
      discarded_listing_title: row.title,
      discarded_price: Number.isFinite(row.price) ? row.price : null,
      match_score: score,
      platform,
    });
  }
  return out;
}

export function findBestComparables(
  itemDetails: ItemDetails,
  ebayResults: MarketListing[],
  vintedResults: MarketListing[],
  depopResults: MarketListing[],
): FindBestComparablesResult {
  const item: ItemDetails = {
    brand: brandForMatching(String(itemDetails.brand ?? "").trim()),
    type: String(itemDetails.type ?? "").trim(),
    colour: String(itemDetails.colour ?? "").trim(),
    condition: String(itemDetails.condition ?? "GOOD").trim(),
    size: String(itemDetails.size ?? "").trim(),
  };

  const minMatch = minMatchThreshold(item);

  const scorePlatform = (listings: MarketListing[], platform: ComparablePlatform) =>
    listings.map((l) => scoreListing(l, platform, item));

  const ebayScored = scorePlatform(ebayResults, "ebay");
  const vintedScored = scorePlatform(vintedResults, "vinted");
  const depopScored = scorePlatform(depopResults, "depop");

  const ebay = slicePlatform(ebayScored, minMatch);
  const vinted = slicePlatform(vintedScored, minMatch);
  const depop = slicePlatform(depopScored, minMatch);

  const all_passing = [...ebayScored, ...vintedScored, ...depopScored]
    .filter((s) => s.score >= minMatch)
    .sort((a, b) => b.score - a.score)
    .map((s) => s.listing);

  const average_price = computeAveragePrice([ebay, vinted, depop]);
  const overall_confidence = overallConfidenceScore([ebay, vinted, depop], all_passing);

  return {
    ebay,
    vinted,
    depop,
    all_passing,
    average_price,
    overall_confidence,
  };
}

export function collectComparableDiscards(
  itemDetails: ItemDetails,
  ebayResults: MarketListing[],
  vintedResults: MarketListing[],
  depopResults: MarketListing[],
  result: FindBestComparablesResult,
): FindBestComparablesDiscard[] {
  const passingIds = new Set(result.all_passing.map((l) => l.id));
  return [
    ...collectDiscards(itemDetails, "ebay", ebayResults, passingIds),
    ...collectDiscards(itemDetails, "vinted", vintedResults, passingIds),
    ...collectDiscards(itemDetails, "depop", depopResults, passingIds),
  ].slice(0, 80);
}
