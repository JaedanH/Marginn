/**
 * Client mirror of Edge `findBestComparables` — types, scoring, removal recalc.
 * Optional Haiku re-ranking via Edge `score-comparables` (never breaks scan on failure).
 */
import { calculateMScore, type MScoreBrandTier } from './calculateMScore';
import { edgeFunctionAuthHeaders } from '../supabaseClient';
import { supabaseFunctionUrl } from './supabaseFunctions';

export type ComparablePlatform = 'ebay' | 'vinted' | 'depop';

export interface ItemDetails {
  brand: string;
  type: string;
  colour: string;
  condition: string;
  size: string;
}

export interface RawMarketListing {
  title: string;
  price: number;
  listing_url: string;
  days_ago: number | null;
  condition?: string;
}

export interface ComparableListing {
  id: string;
  platform: ComparablePlatform;
  title: string;
  price: number;
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

export interface ComparablesPayload {
  ebay: PlatformComparablesSlice;
  vinted: PlatformComparablesSlice;
  depop: PlatformComparablesSlice;
  all_passing: ComparableListing[];
  average_price: number | null;
  overall_confidence: number;
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

/** Keep in sync with Edge `_shared/findBestComparables.ts`. */
const MIN_MATCH = 0.55;
const STRONG_MATCH = 0.75;
const MIN_STRONG_FOR_AVG = 3;
const RECENCY_WINDOW_DAYS = 90;

const BRAND_ALIASES: Record<string, string[]> = {
  'carhartt wip': ['carhartt', 'wip'],
  'ralph lauren': ['polo', 'rl'],
  'stone island': ['stoney', 'si'],
  'north face': ['tnf', 'the north face'],
};

const CONDITION_TERMS: Record<string, string[]> = {
  LIKE_NEW: ['like new', 'bnwt', 'brand new', 'new with tags', 'unworn', 'mint', 'nwt'],
  GOOD: ['good', 'excellent', 'vgc', 'very good', 'great condition'],
  LIGHT_WEAR: ['light wear', 'worn once', 'lightly worn', 'minor wear'],
  FADED: ['faded', 'fade', 'sun faded'],
  CRACKED_LOGO: ['cracked logo', 'logo crack', 'peeling logo'],
  STAINS: ['stain', 'stained', 'mark', 'spot'],
  HEAVY_WEAR: ['heavy wear', 'well worn', 'distressed', 'beat up', 'damaged', 'hole', 'rip'],
};

const TYPE_SYNONYMS: Record<string, string[]> = {
  hoodie: ['hoodie', 'hoody', 'pullover', 'sweatshirt'],
  jacket: ['jacket', 'coat', 'parka', 'bomber', 'windbreaker', 'gilet'],
  trainers: ['trainer', 'sneaker', 'shoe', 'footwear'],
  tshirt: ['t-shirt', 'tee', 't shirt'],
  jeans: ['jean', 'denim', 'trouser', 'pant'],
  shirt: ['shirt', 'oxford', 'button down', 'polo'],
};

const COLOUR_GROUPS: Record<string, string[]> = {
  black: ['black', 'blk', 'noir'],
  white: ['white', 'cream', 'off white', 'ivory'],
  navy: ['navy', 'dark blue'],
  blue: ['blue', 'cobalt', 'royal'],
  grey: ['grey', 'gray', 'charcoal', 'heather'],
  green: ['green', 'olive', 'khaki', 'sage'],
  red: ['red', 'burgundy', 'maroon', 'wine'],
  brown: ['brown', 'tan', 'beige', 'camel'],
  pink: ['pink', 'rose'],
  yellow: ['yellow', 'mustard'],
  orange: ['orange', 'rust'],
  purple: ['purple', 'lilac', 'violet'],
};

function norm(s: string): string {
  return s
    .toLowerCase()
    .replace(/['']/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function tokens(s: string): string[] {
  return norm(s).split(' ').filter((w) => w.length > 1);
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
  const b = norm(brand);
  if (!b || b === 'unknown') return 0.45;
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
  if (!it || it === 'unknown') return 0.5;
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
  const t = `${norm(title)} ${norm(listingCondition ?? '')}`;
  const grade = target.toUpperCase().replace(/\s+/g, '_');
  const terms = CONDITION_TERMS[grade] ?? CONDITION_TERMS.GOOD ?? [];
  if (terms.some((term) => t.includes(term))) return 1;
  const order = [
    'LIKE_NEW',
    'GOOD',
    'LIGHT_WEAR',
    'FADED',
    'CRACKED_LOGO',
    'STAINS',
    'HEAVY_WEAR',
  ];
  const idx = order.indexOf(grade);
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
  if (!c || c === 'unknown' || c === 'multi') return 0.55;
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
  if (!s || s === 'unknown' || s === 'one size') return 0.6;
  const t = norm(title);
  if (t.includes(s)) return 1;
  const m = s.match(/\b(xs|s|m|l|xl|xxl|xxxl|\d{2})\b/);
  if (m && t.includes(m[1])) return 0.9;
  return 0.5;
}

function scoreListing(
  listing: RawMarketListing,
  platform: ComparablePlatform,
  item: ItemDetails
): { score: number; listing: ComparableListing } {
  const brandS = brandScore(listing.title, item.brand);
  const typeS = typeScore(listing.title, item.type);
  const condS = conditionScore(listing.title, listing.condition, item.condition);
  const colourS = colourScore(listing.title, item.colour);
  const recencyS = recencyScore(listing.days_ago);
  const sizeS = sizeScore(listing.title, item.size);

  const score =
    brandS * 0.28 +
    typeS * 0.24 +
    condS * 0.16 +
    colourS * 0.14 +
    recencyS * 0.12 +
    sizeS * 0.06;

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

function clamp(n: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, n));
}

/** Legacy analyse-item: `comparables` was a flat eBay card array. */
function parseLegacyComparablesArray(raw: unknown[]): ComparablesPayload | null {
  const top5: ComparableListing[] = [];
  for (const entry of raw) {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) continue;
    const r = entry as Record<string, unknown>;
    const title = String(r.title ?? '').trim();
    const price = Number(r.price);
    if (!title || !Number.isFinite(price)) continue;
    const url = String(r.listing_url ?? r.url ?? '').trim();
    const platform: ComparablePlatform =
      r.platform === 'vinted' || r.platform === 'depop' ? r.platform : 'ebay';
    top5.push({
      id: String(r.id ?? stableId(platform, title, price, url)),
      platform,
      title,
      price,
      date_at: null,
      days_ago: typeof r.days_ago === 'number' ? r.days_ago : null,
      match_percent: typeof r.match_percent === 'number' ? Math.round(r.match_percent) : 0,
      url,
    });
    if (top5.length >= 5) break;
  }
  if (top5.length === 0) return null;
  const ebayOnly = top5.filter((l) => l.platform === 'ebay');
  const ebayRows = ebayOnly.length > 0 ? ebayOnly : top5;
  const emptySlice = (): PlatformComparablesSlice => ({
    top5: [],
    strong_match_count: 0,
    low_confidence: true,
  });
  return {
    ebay: {
      top5: ebayRows.slice(0, 5),
      strong_match_count: ebayRows.length,
      low_confidence: ebayRows.length < MIN_STRONG_FOR_AVG,
    },
    vinted: emptySlice(),
    depop: emptySlice(),
    all_passing: ebayRows,
    average_price: median(ebayRows.map((l) => l.price)),
    overall_confidence: 0,
  };
}

export function hasAnyComparables(payload: ComparablesPayload | null): boolean {
  if (!payload) return false;
  return (
    payload.ebay.top5.length > 0 ||
    payload.vinted.top5.length > 0 ||
    payload.depop.top5.length > 0 ||
    payload.all_passing.length > 0
  );
}

/** Build eBay-only comparables from `sold_comp_previews` when structured comparables are empty. */
export function buildComparablesFromSoldPreviews(raw: unknown): ComparablesPayload | null {
  if (!Array.isArray(raw) || raw.length === 0) return null;
  const top5: ComparableListing[] = [];
  for (const entry of raw) {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) continue;
    const r = entry as Record<string, unknown>;
    const title = String(r.title ?? '').trim();
    const priceRaw = r.price_gbp ?? r.price;
    const price = typeof priceRaw === 'number' ? priceRaw : Number(priceRaw);
    if (!title || !Number.isFinite(price) || price <= 0) continue;
    const url = String(r.listing_url ?? r.url ?? '').trim();
    const platform: ComparablePlatform =
      r.platform === 'vinted' || r.platform === 'depop' ? r.platform : 'ebay';
    top5.push({
      id: String(r.id ?? stableId(platform, title, price, url)),
      platform,
      title,
      price: Math.round(price * 100) / 100,
      date_at: null,
      days_ago: typeof r.days_ago === 'number' ? r.days_ago : null,
      match_percent: 0,
      url,
    });
    if (top5.length >= 5) break;
  }
  if (top5.length === 0) return null;
  const emptySlice = (): PlatformComparablesSlice => ({
    top5: [],
    strong_match_count: 0,
    low_confidence: true,
  });
  const ebayRows = top5.filter((l) => l.platform === 'ebay');
  const ebayTop = (ebayRows.length > 0 ? ebayRows : top5).slice(0, 5);
  return {
    ebay: {
      top5: ebayTop,
      strong_match_count: ebayTop.length,
      low_confidence: ebayTop.length < MIN_STRONG_FOR_AVG,
    },
    vinted: emptySlice(),
    depop: emptySlice(),
    all_passing: ebayTop,
    average_price: median(ebayTop.map((l) => l.price)),
    overall_confidence: 0,
  };
}

/**
 * Parse comparables from scan complete payload (structured, legacy array, or sold previews).
 */
export function resolveComparablesFromScanPayload(data: Record<string, unknown>): {
  payload: ComparablesPayload | null;
  unavailableReason: string | null;
} {
  const raw = data.comparables;
  if (!('comparables' in data)) {
    const fromPreviews = buildComparablesFromSoldPreviews(data.sold_comp_previews);
    if (fromPreviews) return { payload: fromPreviews, unavailableReason: null };
    return {
      payload: null,
      unavailableReason:
        'Comparable matching is not on this server yet. Deploy analyse-item with findBestComparables.',
    };
  }
  let parsed = parseComparablesPayload(raw);
  if (!hasAnyComparables(parsed)) {
    const fromPreviews = buildComparablesFromSoldPreviews(data.sold_comp_previews);
    if (fromPreviews) parsed = fromPreviews;
  }
  if (!hasAnyComparables(parsed)) {
    return { payload: parsed, unavailableReason: null };
  }
  return { payload: parsed, unavailableReason: null };
}

export function parseComparablesPayload(raw: unknown): ComparablesPayload | null {
  if (!raw) return null;
  if (Array.isArray(raw)) return parseLegacyComparablesArray(raw);
  if (typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  const slice = (key: string): PlatformComparablesSlice => {
    const s = o[key];
    if (!s || typeof s !== 'object' || Array.isArray(s)) {
      return { top5: [], strong_match_count: 0, low_confidence: true };
    }
    const row = s as Record<string, unknown>;
    const top5Raw = row.top5;
    const top5 = Array.isArray(top5Raw)
      ? top5Raw
          .map((x) => parseComparableListing(x))
          .filter((x): x is ComparableListing => x != null)
      : [];
    return {
      top5,
      strong_match_count:
        typeof row.strong_match_count === 'number' ? row.strong_match_count : 0,
      low_confidence: row.low_confidence === true,
    };
  };
  const allRaw = o.all_passing;
  const all_passing = Array.isArray(allRaw)
    ? allRaw
        .map((x) => parseComparableListing(x))
        .filter((x): x is ComparableListing => x != null)
    : [];
  const mRaw = o.m_score_recalc;
  let m_score_recalc: ComparablesPayload['m_score_recalc'];
  if (mRaw && typeof mRaw === 'object' && !Array.isArray(mRaw)) {
    const m = mRaw as Record<string, unknown>;
    m_score_recalc = {
      sold_last7: Number(m.sold_last7 ?? 0),
      sold_last30: Number(m.sold_last30 ?? 0),
      live_listings: Number(m.live_listings ?? 1),
      net_profit: Number(m.net_profit ?? 0),
      brand_tier: String(m.brand_tier ?? 'MED'),
      condition_grade: String(m.condition_grade ?? 'GOOD'),
      item_type: String(m.item_type ?? ''),
      brand_confidence: Number(m.brand_confidence ?? 0.7),
      buy_price: Number(m.buy_price ?? 0),
      month: Number(m.month ?? new Date().getUTCMonth() + 1),
    };
  }
  return {
    ebay: slice('ebay'),
    vinted: slice('vinted'),
    depop: slice('depop'),
    all_passing,
    average_price:
      typeof o.average_price === 'number' && Number.isFinite(o.average_price)
        ? o.average_price
        : null,
    overall_confidence:
      typeof o.overall_confidence === 'number' ? Math.round(o.overall_confidence) : 0,
    m_score_recalc,
  };
}

function parseComparableListing(raw: unknown): ComparableListing | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const r = raw as Record<string, unknown>;
  const title = String(r.title ?? '').trim();
  const price = Number(r.price);
  const platform = r.platform;
  if (
    !title ||
    !Number.isFinite(price) ||
    (platform !== 'ebay' && platform !== 'vinted' && platform !== 'depop')
  ) {
    return null;
  }
  return {
    id: String(r.id ?? stableId(platform, title, price, String(r.url ?? ''))),
    platform,
    title,
    price,
    date_at: typeof r.date_at === 'string' ? r.date_at : null,
    days_ago: typeof r.days_ago === 'number' ? r.days_ago : null,
    match_percent: typeof r.match_percent === 'number' ? Math.round(r.match_percent) : 0,
    url: String(r.url ?? r.listing_url ?? '').trim(),
  };
}

export function applyComparableRemoval(
  payload: ComparablesPayload,
  removedId: string
): ComparablesPayload {
  const filterSlice = (slice: PlatformComparablesSlice): PlatformComparablesSlice => {
    const top5 = slice.top5.filter((l) => l.id !== removedId);
    const strong = top5.filter((l) => l.match_percent >= STRONG_MATCH * 100).length;
    return {
      top5,
      strong_match_count: strong,
      low_confidence: strong < MIN_STRONG_FOR_AVG,
    };
  };
  const ebay = filterSlice(payload.ebay);
  const vinted = filterSlice(payload.vinted);
  const depop = filterSlice(payload.depop);
  const all_passing = payload.all_passing.filter((l) => l.id !== removedId);

  const prices: number[] = [];
  for (const slice of [ebay, vinted, depop]) {
    if (slice.low_confidence) continue;
    for (const row of slice.top5) {
      if (row.price > 0) prices.push(row.price);
    }
  }

  return {
    ...payload,
    ebay,
    vinted,
    depop,
    all_passing,
    average_price: prices.length > 0 ? median(prices) : null,
  };
}

export function recalculateMScoreFromComparables(
  payload: ComparablesPayload,
  removedIds: Set<string>
): { score: number; breakdown: Record<string, unknown> } | null {
  const ctx = payload.m_score_recalc;
  if (!ctx) return null;

  const ebayPrices = payload.ebay.top5
    .filter((l) => !removedIds.has(l.id))
    .map((l) => l.price)
    .filter((p) => p > 0);
  if (ebayPrices.length === 0) return null;

  const sorted = [...ebayPrices].sort((a, b) => a - b);
  const avgPrice = sorted.reduce((a, b) => a + b, 0) / sorted.length;
  const minPrice = sorted[0]!;
  const maxPrice = sorted[sorted.length - 1]!;

  const tier = ctx.brand_tier.toUpperCase();
  const brandTier: MScoreBrandTier =
    tier === 'HIGH' || tier === 'LOW' || tier === 'MED' ? tier : 'MED';

  const result = calculateMScore({
    soldLast7: ctx.sold_last7,
    soldLast30: ctx.sold_last30,
    liveListings: ctx.live_listings,
    avgPrice,
    minPrice,
    maxPrice,
    netProfit: ctx.net_profit,
    brandTier,
    conditionGrade: ctx.condition_grade,
    itemType: ctx.item_type,
    brandConfidence: ctx.brand_confidence,
    buyPrice: ctx.buy_price,
    listingCountUsed: ebayPrices.length,
    month: ctx.month,
  });

  return { score: result.score, breakdown: result as unknown as Record<string, unknown> };
}

export function formatComparableTimeAgo(daysAgo: number | null): string {
  if (daysAgo === null || !Number.isFinite(daysAgo)) return 'Listed recently';
  if (daysAgo <= 0) return 'Today';
  if (daysAgo === 1) return '1 day ago';
  if (daysAgo < 7) return `${daysAgo} days ago`;
  if (daysAgo < 30) return `${Math.round(daysAgo / 7)} wk ago`;
  return `${Math.round(daysAgo / 30)} mo ago`;
}

export const PLATFORM_BADGE: Record<
  ComparablePlatform,
  { label: string; className: string }
> = {
  ebay: { label: 'eBay', className: 'bg-yellow-100 text-yellow-800 border-yellow-200' },
  vinted: { label: 'Vinted', className: 'bg-teal-100 text-teal-800 border-teal-200' },
  depop: { label: 'Depop', className: 'bg-pink-100 text-pink-800 border-pink-200' },
};

// ---------------------------------------------------------------------------
// Haiku-enhanced comparables (optional — scan keeps server payload if this fails)
// ---------------------------------------------------------------------------

export interface ScannedItem {
  brand: string;
  itemType: string;
  colour: string;
  condition: string;
}

export interface ListingResult {
  title: string;
  price: number;
  platform: ComparablePlatform;
  url: string;
  dateListed: string;
  matchScore?: number;
}

export interface ComparablesResult {
  topEbay: ListingResult[];
  topVinted: ListingResult[];
  topDepop: ListingResult[];
  averagePrice: number;
  confidenceScore: number;
  reliable: boolean;
  fallbackUsed: boolean;
  error?: string;
}

const HAIKU_MATCH_THRESHOLD = 70;
const HAIKU_MIN_STRONG_PER_PLATFORM = 3;
const HAIKU_TIMEOUT_MS = 5000;

function logComparable(msg: string, detail?: unknown): void {
  if (detail !== undefined) console.warn(`[findBestComparables] ${msg}`, detail);
  else console.warn(`[findBestComparables] ${msg}`);
}

function isNonEmptyString(v: unknown): v is string {
  return typeof v === 'string' && v.trim().length > 0;
}

function daysAgoFromIso(iso: string): number | null {
  const ms = Date.parse(iso);
  if (!Number.isFinite(ms)) return null;
  const days = Math.floor((Date.now() - ms) / 86_400_000);
  return days >= 0 ? days : null;
}

function simpleAverage(prices: number[]): number {
  const valid = prices.filter((p) => Number.isFinite(p) && p > 0);
  if (valid.length === 0) return 0;
  return Math.round((valid.reduce((a, b) => a + b, 0) / valid.length) * 100) / 100;
}

function trimmedMean(prices: number[]): number {
  const valid = [...prices].filter((p) => Number.isFinite(p) && p > 0).sort((a, b) => a - b);
  if (valid.length === 0) return 0;
  if (valid.length < 5) return simpleAverage(valid);
  const trim = Math.max(1, Math.floor(valid.length * 0.1));
  const slice = valid.slice(trim, valid.length - trim);
  if (slice.length === 0) return simpleAverage(valid);
  return simpleAverage(slice);
}

function computeHaikuConfidence(
  strongMatches: ListingResult[],
  averagePrice: number
): number {
  if (strongMatches.length === 0 || averagePrice <= 0) return 0;
  const countScore = clamp(strongMatches.length * 8, 0, 40);
  const prices = strongMatches.map((l) => l.price);
  const min = Math.min(...prices);
  const max = Math.max(...prices);
  const spread = max / Math.max(min, 1);
  const spreadScore = spread <= 1.35 ? 35 : spread <= 2 ? 22 : spread <= 3 ? 12 : 4;
  let recencySum = 0;
  let recencyN = 0;
  for (const row of strongMatches) {
    const d = daysAgoFromIso(row.dateListed);
    if (d === null) continue;
    recencyN += 1;
    if (d <= 30) recencySum += 100;
    else if (d <= 60) recencySum += 80;
    else if (d <= 90) recencySum += 60;
    else recencySum += 30;
  }
  const recencyScore = recencyN > 0 ? (recencySum / recencyN) * 0.25 : 15;
  return Math.round(clamp(countScore + spreadScore + recencyScore, 0, 100));
}

function topNByPlatform(rows: ListingResult[], platform: ComparablePlatform, n = 5): ListingResult[] {
  return rows.filter((r) => r.platform === platform).slice(0, n);
}

export function buildFallbackResult(
  ebayResults: ListingResult[],
  vintedResults: ListingResult[],
  depopResults: ListingResult[],
  error?: string
): ComparablesResult {
  const all = [...ebayResults, ...vintedResults, ...depopResults].filter(
    (r) => isNonEmptyString(r.title) && Number.isFinite(r.price) && r.price > 0
  );
  const avg = simpleAverage(all.map((r) => r.price));
  return {
    topEbay: topNByPlatform(all, 'ebay'),
    topVinted: topNByPlatform(all, 'vinted'),
    topDepop: topNByPlatform(all, 'depop'),
    averagePrice: avg,
    confidenceScore: all.length >= 5 ? Math.min(45, all.length * 5) : 0,
    reliable: false,
    fallbackUsed: true,
    error,
  };
}

async function scoreListingsWithHaiku(
  scannedItem: ScannedItem,
  listings: ListingResult[]
): Promise<number[] | null> {
  if (listings.length === 0) return [];
  try {
    const headers = await edgeFunctionAuthHeaders();
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), HAIKU_TIMEOUT_MS);
    const res = await fetch(supabaseFunctionUrl('score-comparables'), {
      method: 'POST',
      headers: { ...headers, 'Content-Type': 'application/json' },
      signal: controller.signal,
      body: JSON.stringify({
        scannedItem,
        listings: listings.map((l) => ({
          title: l.title,
          price: l.price,
          platform: l.platform,
          dateListed: l.dateListed,
        })),
      }),
    }).finally(() => clearTimeout(timer));

    if (!res.ok) {
      logComparable('Haiku edge call failed', res.status);
      return null;
    }
    const json = (await res.json()) as { scores?: unknown[]; error?: string };
    if (!Array.isArray(json.scores)) {
      logComparable('Haiku response missing scores', json.error);
      return null;
    }
    if (json.scores.length !== listings.length) {
      logComparable('Haiku score length mismatch');
      return null;
    }
    const normalized = json.scores.map((s) => {
      const n = typeof s === 'number' ? s : Number(s);
      if (!Number.isFinite(n)) return 0;
      return clamp(Math.round(n), 0, 100);
    });
    const zeroCount = normalized.filter((s) => s === 0).length;
    if (zeroCount / normalized.length > 0.5) {
      logComparable('Haiku returned mostly zero scores');
      return null;
    }
    return normalized;
  } catch (e) {
    logComparable('Haiku scoring error', e instanceof Error ? e.message : e);
    return null;
  }
}

function applyScores(listings: ListingResult[], scores: number[]): ListingResult[] {
  return listings.map((l, i) => ({ ...l, matchScore: scores[i] ?? 0 }));
}

function filterRankAndSlice(rows: ListingResult[]): ListingResult[] {
  return rows
    .filter((r) => (r.matchScore ?? 0) >= HAIKU_MATCH_THRESHOLD)
    .sort((a, b) => (b.matchScore ?? 0) - (a.matchScore ?? 0));
}

/**
 * Haiku-enhanced comparable matching. Never throws — always returns ComparablesResult.
 * On any failure uses buildFallbackResult (simple average, reliable: false).
 */
export async function findBestComparables(
  scannedItem: ScannedItem,
  ebayResults: ListingResult[],
  vintedResults: ListingResult[],
  depopResults: ListingResult[]
): Promise<ComparablesResult> {
  try {
    const ebay = Array.isArray(ebayResults) ? ebayResults : [];
    const vinted = Array.isArray(vintedResults) ? vintedResults : [];
    const depop = Array.isArray(depopResults) ? depopResults : [];

    if (!isNonEmptyString(scannedItem?.brand) || !isNonEmptyString(scannedItem?.itemType)) {
      return buildFallbackResult(ebay, vinted, depop, 'missing brand or itemType');
    }

    const total = ebay.length + vinted.length + depop.length;
    if (total === 0) {
      return buildFallbackResult([], [], [], 'no listing results');
    }

    if (total < 5) {
      return buildFallbackResult(ebay, vinted, depop, 'fewer than 5 total listings');
    }

    const combined = [...ebay, ...vinted, ...depop];
    const haikuScores = await scoreListingsWithHaiku(scannedItem, combined);
    if (!haikuScores) {
      return buildFallbackResult(ebay, vinted, depop, 'Haiku scoring unavailable');
    }

    const scored = applyScores(combined, haikuScores);
    const ebayStrong = filterRankAndSlice(scored.filter((r) => r.platform === 'ebay'));
    const vintedStrong = filterRankAndSlice(scored.filter((r) => r.platform === 'vinted'));
    const depopStrong = filterRankAndSlice(scored.filter((r) => r.platform === 'depop'));

    const strongAll = [...ebayStrong, ...vintedStrong, ...depopStrong];
    const averagePrice = trimmedMean(strongAll.map((r) => r.price));
    const confidenceScore = computeHaikuConfidence(strongAll, averagePrice);

    const reliable =
      ebayStrong.length >= HAIKU_MIN_STRONG_PER_PLATFORM &&
      vintedStrong.length >= HAIKU_MIN_STRONG_PER_PLATFORM &&
      depopStrong.length >= HAIKU_MIN_STRONG_PER_PLATFORM;

    return {
      topEbay: ebayStrong.slice(0, 5),
      topVinted: vintedStrong.slice(0, 5),
      topDepop: depopStrong.slice(0, 5),
      averagePrice,
      confidenceScore,
      reliable,
      fallbackUsed: false,
    };
  } catch (e) {
    logComparable('unexpected error', e);
    return buildFallbackResult(
      ebayResults ?? [],
      vintedResults ?? [],
      depopResults ?? [],
      e instanceof Error ? e.message : 'unknown error'
    );
  }
}

function listingResultFromComparable(l: ComparableListing): ListingResult {
  return {
    title: l.title,
    price: l.price,
    platform: l.platform,
    url: l.url,
    dateListed: l.date_at ?? new Date().toISOString(),
    matchScore: l.match_percent,
  };
}

export function listingResultsFromPayload(payload: ComparablesPayload): {
  ebay: ListingResult[];
  vinted: ListingResult[];
  depop: ListingResult[];
} {
  const seen = new Set<string>();
  const ebay: ListingResult[] = [];
  const vinted: ListingResult[] = [];
  const depop: ListingResult[] = [];

  const push = (l: ComparableListing) => {
    if (seen.has(l.id)) return;
    seen.add(l.id);
    const row = listingResultFromComparable(l);
    if (l.platform === 'ebay') ebay.push(row);
    else if (l.platform === 'vinted') vinted.push(row);
    else depop.push(row);
  };

  for (const l of payload.all_passing) push(l);
  for (const l of payload.ebay.top5) push(l);
  for (const l of payload.vinted.top5) push(l);
  for (const l of payload.depop.top5) push(l);

  return { ebay, vinted, depop };
}

export function comparablesPayloadFromHaikuResult(
  result: ComparablesResult,
  mScoreRecalc?: ComparablesPayload['m_score_recalc']
): ComparablesPayload {
  const toListing = (lr: ListingResult): ComparableListing => ({
    id: stableId(lr.platform, lr.title, lr.price, lr.url),
    platform: lr.platform,
    title: lr.title,
    price: lr.price,
    date_at: lr.dateListed || null,
    days_ago: daysAgoFromIso(lr.dateListed),
    match_percent: lr.matchScore ?? 0,
    url: lr.url,
  });

  const slice = (rows: ListingResult[]): PlatformComparablesSlice => {
    const top5 = rows.slice(0, 5).map(toListing);
    const strong = rows.filter((r) => (r.matchScore ?? 0) >= HAIKU_MATCH_THRESHOLD).length;
    return {
      top5,
      strong_match_count: strong,
      low_confidence: strong < HAIKU_MIN_STRONG_PER_PLATFORM,
    };
  };

  const allStrong = [...result.topEbay, ...result.topVinted, ...result.topDepop]
    .filter((r) => (r.matchScore ?? 0) >= HAIKU_MATCH_THRESHOLD)
    .sort((a, b) => (b.matchScore ?? 0) - (a.matchScore ?? 0))
    .map(toListing);

  return {
    ebay: slice(result.topEbay),
    vinted: slice(result.topVinted),
    depop: slice(result.topDepop),
    all_passing: allStrong,
    average_price: result.averagePrice > 0 ? result.averagePrice : null,
    overall_confidence: result.confidenceScore,
    m_score_recalc: mScoreRecalc,
  };
}

/**
 * Optionally re-rank server comparables with Haiku. Returns original payload if enhancement fails.
 */
export async function tryEnhanceComparablesPayload(
  existing: ComparablesPayload,
  scannedItem: ScannedItem,
  mScoreRecalc?: ComparablesPayload['m_score_recalc']
): Promise<ComparablesPayload> {
  try {
    if (!hasAnyComparables(existing)) return existing;
    const { ebay, vinted, depop } = listingResultsFromPayload(existing);
    const result = await findBestComparables(scannedItem, ebay, vinted, depop);
    if (result.fallbackUsed) {
      logComparable('enhancement skipped — using server comparables', result.error);
      return existing;
    }
    return comparablesPayloadFromHaikuResult(result, mScoreRecalc ?? existing.m_score_recalc);
  } catch (e) {
    logComparable('enhancement error — using server comparables', e);
    return existing;
  }
}

if (import.meta.env.DEV) {
  const testItem: ScannedItem = {
    brand: 'Nike',
    itemType: 'hoodie',
    colour: 'black',
    condition: 'good',
  };
  const testResults: ListingResult[] = [
    {
      title: 'Nike Black Hoodie',
      price: 45,
      platform: 'ebay',
      url: '',
      dateListed: new Date().toISOString(),
    },
  ];
  findBestComparables(testItem, testResults, [], [])
    .then((r) => console.log('[findBestComparables] smoke test passed', r))
    .catch((e) => console.error('[findBestComparables] smoke test failed', e));
}
