/**
 * Data-backed Flip Score (0–10, one decimal) — not Claude `trend_score`.
 *
 * Formula (high level):
 * 1. Sub-scores (each 0–10): velocity, margin, supply_gap, brand_tier, price_stability.
 * 2. weightedBase = Σ (weight_i × sub_i)
 *    weights: velocity 30%, margin 25%, supply_gap 20%, brand_tier 15%, price_stability 10%.
 * 3. afterCondition = weightedBase × conditionModifier (LIKE_NEW 1.00 … HEAVY_WEAR ~0.88).
 * 4. afterSeasonal = afterCondition × seasonalModifier (≈0.97–1.03 from calendar month + item keywords).
 * 5. score = round(clamp(afterSeasonal, 0, 10) × 10) / 10  → one decimal.
 *
 * Sold velocity: prefer `days_ago` on extracted eBay sold cards. If too many nulls, blend in a
 * conservative proxy from SERP sold-marker density (`soldMarkersOnPage`) so d7/d30 are never
 * both zero when the scrape clearly saw activity.
 */

export type FlipScoreConditionGrade =
  | "LIKE_NEW"
  | "GOOD"
  | "LIGHT_WEAR"
  | "FADED"
  | "CRACKED_LOGO"
  | "STAINS"
  | "HEAVY_WEAR";

export interface FlipScoreListingDay {
  days_ago: number | null;
}

export interface CalculateFlipScoreInput {
  /** eBay sold cards for this scrape (same source as listing_cache rows). */
  ebaySoldCards: FlipScoreListingDay[];
  /** Raw £ prices from sold SERP (for IQR / median stability). */
  ebayPrices: number[];
  /** Optional precomputed median / IQR from caller; if omitted, derived from ebayPrices. */
  ebayPriceMedian?: number;
  ebayPriceIqr?: number;
  brandRow: Record<string, unknown> | null;
  condition_grade: string;
  buy_price_gbp: number | null;
  net_profit_gbp: number | null;
  roi_percent: number | null;
  resale_gbp: number;
  /** Total live listing counts (scraped) across platforms — supply proxy. */
  liveListingTotal: number;
  /** Count of sold markers / sold UI hits on full eBay HTML (fallback signal). */
  soldMarkersOnPage: number;
  /** Month 1–12 (UTC) for lightweight seasonality. */
  month?: number;
  /** Vision/AI item keywords: item_type, category, style, brand_name, etc. */
  itemKeywords?: string[];
}

export interface FlipScoreBreakdown {
  velocity: number;
  margin: number;
  supply_gap: number;
  brand_tier: number;
  price_stability: number;
  weights: {
    velocity: number;
    margin: number;
    supply_gap: number;
    brand_tier: number;
    price_stability: number;
  };
  weighted_base: number;
  condition_modifier: number;
  seasonal_modifier: number;
  condition_grade: string;
  sold_velocity: { d7: number; d30: number; method: "days_ago" | "mixed_days_ago_proxy" };
  labels: Record<string, string>;
  /** Claude-only hint; never use as the primary flip score. */
  vision_trend_hint?: number;
}

export interface CalculateFlipScoreResult {
  score: number;
  breakdown: FlipScoreBreakdown;
}

const W_VELOCITY = 0.3;
const W_MARGIN = 0.25;
const W_SUPPLY = 0.2;
const W_BRAND = 0.15;
const W_STAB = 0.1;

const CONDITION_MOD: Record<string, number> = {
  LIKE_NEW: 1.0,
  GOOD: 0.98,
  LIGHT_WEAR: 0.94,
  FADED: 0.9,
  CRACKED_LOGO: 0.9,
  STAINS: 0.88,
  HEAVY_WEAR: 0.86,
};

function clamp(n: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, n));
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

function medianSorted(sorted: number[]): number {
  if (sorted.length === 0) return 0;
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 !== 0 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
}

function quantileSorted(sorted: number[], q: number): number {
  if (sorted.length === 0) return 0;
  const pos = (sorted.length - 1) * q;
  const base = Math.floor(pos);
  const rest = pos - base;
  if (sorted[base + 1] === undefined) return sorted[base]!;
  return sorted[base]! + rest * (sorted[base + 1]! - sorted[base]!);
}

function iqrFromPrices(prices: number[]): { median: number; iqr: number } {
  if (prices.length === 0) return { median: 0, iqr: 0 };
  const sorted = [...prices].sort((a, b) => a - b);
  const q1 = quantileSorted(sorted, 0.25);
  const q3 = quantileSorted(sorted, 0.75);
  const med = medianSorted(sorted);
  return { median: med, iqr: Math.max(0, q3 - q1) };
}

/**
 * Prefer strict `days_ago` windows. If ≥60% of cards lack `days_ago`, blend in a conservative
 * proxy from `soldMarkersOnPage` so velocity is not falsely zero.
 */
export function resolveSoldVelocity(
  cards: FlipScoreListingDay[],
  soldMarkersOnPage: number,
): { d7: number; d30: number; method: "days_ago" | "mixed_days_ago_proxy" } {
  const n = cards.length;
  if (n === 0) {
    const proxy = Math.min(30, Math.max(0, Math.round(soldMarkersOnPage * 0.35)));
    return {
      d7: Math.round(proxy * (7 / 30) * 0.85),
      d30: proxy,
      method: "mixed_days_ago_proxy",
    };
  }

  const known = cards.filter((c) => c.days_ago !== null && c.days_ago !== undefined && Number.isFinite(c.days_ago));
  const nullHeavy = known.length / n < 0.4;

  let d7 = known.filter((c) => (c.days_ago as number) <= 7).length;
  let d30 = known.filter((c) => (c.days_ago as number) <= 30).length;
  let method: "days_ago" | "mixed_days_ago_proxy" = "days_ago";

  if (nullHeavy) {
    method = "mixed_days_ago_proxy";
    const unknown = n - known.length;
    // Conservative partial credit for undated cards + SERP sold density cap.
    const fromUnknown = Math.round(unknown * 0.22);
    const fromMarkers = Math.round(Math.min(soldMarkersOnPage, 40) * 0.28);
    const floor30 = Math.max(d30, fromUnknown, fromMarkers, d7 > 0 ? d7 * 3 : 0);
    d30 = Math.min(30, Math.max(d30, floor30));
    d7 = Math.max(d7, Math.min(d30, Math.round(d30 * (7 / 30) * 0.85)));
  }

  return { d7, d30, method };
}

function subscoreVelocity(d7: number, d30: number): number {
  // Piecewise demand heat: both windows; cap at 10.
  let s = 2 + Math.min(4, d7 * 0.85) + Math.min(4, Math.log1p(d30) * 1.85);
  if (d30 >= 8) s += 0.8;
  if (d7 >= 3) s += 0.6;
  return round1(clamp(s, 0, 10));
}

function subscoreMargin(
  buy: number | null,
  net: number | null,
  roi: number | null,
  resale: number,
): number {
  if (buy === null || buy <= 0 || net === null) {
    // No buy price: neutral-to-slight optimism from resale level only
    const hint = resale >= 80 ? 5.8 : resale >= 40 ? 5.2 : 4.6;
    return round1(hint);
  }
  let s = 4;
  if (net >= 35) s = 10;
  else if (net >= 22) s = 8.8;
  else if (net >= 14) s = 7.8;
  else if (net >= 8) s = 6.8;
  else if (net >= 3) s = 5.8;
  else if (net >= 0) s = 4.8;
  else if (net >= -8) s = 3.2;
  else s = 1.8;
  if (roi !== null && Number.isFinite(roi)) {
    if (roi >= 120) s = Math.min(10, s + 0.6);
    else if (roi >= 70) s = Math.min(10, s + 0.35);
    else if (roi < 0) s = Math.max(0, s - 0.8);
  }
  return round1(clamp(s, 0, 10));
}

function subscoreSupplyGap(d30: number, liveTotal: number): number {
  const supply = Math.max(1, liveTotal);
  const demand = d30 + 1;
  const ratio = demand / supply;
  // More solds per live listing → better gap
  let s = 3 + ratio * 9;
  if (d30 >= 6 && liveTotal <= 25) s += 1.2;
  return round1(clamp(s, 0, 10));
}

function subscoreBrandTier(brand: Record<string, unknown> | null): number {
  if (!brand) return 5;
  const tierRaw = String(brand.display_tier ?? brand.brand_tier ?? "").trim().toLowerCase();
  const n = parseInt(tierRaw.replace(/\D/g, ""), 10);
  if (tierRaw.includes("lux") || tierRaw.includes("premium") || tierRaw.includes("tier 1") || n === 1) {
    return 9;
  }
  if (tierRaw.includes("strong") || tierRaw.includes("high") || n === 2) return 7.6;
  if (tierRaw.includes("mid") || n === 3) return 6;
  if (tierRaw.includes("value") || tierRaw.includes("budget") || n === 4) return 4.5;
  if (tierRaw.length > 0) return 5.8;
  return 5;
}

function subscorePriceStability(median: number, iqr: number): number {
  if (median <= 0 || iqr < 0) return 5;
  const cv = iqr / median;
  // Lower spread → higher score
  const s = clamp(10 - cv * 12, 0, 10);
  return round1(s);
}

function seasonalModifier(month: number, blob: string): number {
  let m = 1;
  const winter = /coat|jacket|puffer|parka|hoodie|knit|sweater|fleece|gilet/i;
  const summer = /shorts|swim|tank|vest|sandals|slides|cap\b|bucket hat/i;
  if ((month === 11 || month === 12 || month === 1 || month === 2) && winter.test(blob)) m *= 1.025;
  if ((month >= 5 && month <= 8) && summer.test(blob)) m *= 1.02;
  if ((month >= 5 && month <= 8) && winter.test(blob)) m *= 0.98;
  if ((month === 11 || month === 12 || month === 1) && summer.test(blob)) m *= 0.98;
  return round1(clamp(m, 0.97, 1.03));
}

export function calculateFlipScore(input: CalculateFlipScoreInput): CalculateFlipScoreResult {
  const condRaw = String(input.condition_grade ?? "GOOD").toUpperCase();
  const condGrade = (CONDITION_MOD[condRaw] !== undefined ? condRaw : "GOOD") as FlipScoreConditionGrade;
  const conditionMod = CONDITION_MOD[condGrade] ?? 0.94;

  const { d7, d30, method } = resolveSoldVelocity(input.ebaySoldCards, input.soldMarkersOnPage);

  const vel = subscoreVelocity(d7, d30);
  const mar = subscoreMargin(input.buy_price_gbp, input.net_profit_gbp, input.roi_percent, input.resale_gbp);
  const supply = subscoreSupplyGap(d30, input.liveListingTotal);
  const brandS = subscoreBrandTier(input.brandRow);

  let med = input.ebayPriceMedian;
  let iqr = input.ebayPriceIqr;
  if ((med === undefined || med <= 0) || (iqr === undefined || iqr < 0)) {
    const iq = iqrFromPrices(input.ebayPrices);
    med = med && med > 0 ? med : iq.median;
    iqr = iqr !== undefined && iqr >= 0 ? iqr : iq.iqr;
  }
  const stab = subscorePriceStability(med ?? 0, iqr ?? 0);

  const weightedBase = round1(
    W_VELOCITY * vel +
      W_MARGIN * mar +
      W_SUPPLY * supply +
      W_BRAND * brandS +
      W_STAB * stab,
  );

  const month = input.month ?? new Date().getUTCMonth() + 1;
  const kw = (input.itemKeywords ?? []).join(" ").toLowerCase();
  const seasonal = seasonalModifier(month, kw);

  const afterCondition = weightedBase * conditionMod;
  const afterSeasonal = clamp(afterCondition * seasonal, 0, 10);
  const score = round1(afterSeasonal);

  const labels: Record<string, string> = {
    velocity: method === "days_ago" ? "Sold dates parsed from comps" : "Mixed dates — conservative proxy",
    margin: input.buy_price_gbp && input.buy_price_gbp > 0 ? "Uses your buy price + net" : "Enter buy price for full margin signal",
    supply_gap: "Sold pace vs live listings (eBay+Vinted+Depop)",
    brand_tier: input.brandRow ? "Brand tier from Marginn brands table" : "No brand row — baseline",
    price_stability: med > 0 ? "IQR vs median on sold £ prices" : "Limited price sample",
  };

  const breakdown: FlipScoreBreakdown = {
    velocity: vel,
    margin: mar,
    supply_gap: supply,
    brand_tier: brandS,
    price_stability: stab,
    weights: {
      velocity: W_VELOCITY,
      margin: W_MARGIN,
      supply_gap: W_SUPPLY,
      brand_tier: W_BRAND,
      price_stability: W_STAB,
    },
    weighted_base: weightedBase,
    condition_modifier: conditionMod,
    seasonal_modifier: seasonal,
    condition_grade: condGrade,
    sold_velocity: { d7, d30, method },
    labels,
  };

  return { score, breakdown };
}
