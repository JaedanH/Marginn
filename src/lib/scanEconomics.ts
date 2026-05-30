/**
 * Economics aligned with `supabase/functions/analyse-item/index.ts` and scan UI margin math.
 * Keep in sync with Edge CONDITION_MULTIPLIER / fee constants when those change.
 */

/** Live eBay sold comps required before showing resale / profit figures (trust guard). */
export const MIN_EBAY_SOLD_COMPS_FOR_DISPLAY = 10;

export function isResaleDisplaySuppressed(data: Record<string, unknown>): boolean {
  if (data.insufficient_sold_data === true) return true;
  const n = data.ebay_sold_comp_count;
  return typeof n === 'number' && Number.isFinite(n) && n < MIN_EBAY_SOLD_COMPS_FOR_DISPLAY;
}

export const CONDITION_MULTIPLIER: Record<string, number> = {
  LIKE_NEW: 1.0,
  GOOD: 0.85,
  LIGHT_WEAR: 0.72,
  FADED: 0.55,
  CRACKED_LOGO: 0.45,
  STAINS: 0.35,
  HEAVY_WEAR: 0.3,
};

/** Worst → best; one step “upgrades” toward LIKE_NEW. */
export const CONDITION_GRADES_WORST_TO_BEST = [
  'HEAVY_WEAR',
  'STAINS',
  'CRACKED_LOGO',
  'FADED',
  'LIGHT_WEAR',
  'GOOD',
  'LIKE_NEW',
] as const;

export type ConditionGradeKey = (typeof CONDITION_GRADES_WORST_TO_BEST)[number];

export const PLATFORM_FEE_RATE = 0.12;
export const SHIPPING_GBP = 4;
export const MARGIN_BUFFER_GBP = 10;

/** Same figure as dashboard / partner CO₂ summaries (kg per scan). */
export const CO2_TEXTILE_WASTE_KG = 2.1;

export function netProceedsAfterFeesGbp(
  resaleMedianGbp: number,
  feeRate: number = PLATFORM_FEE_RATE,
  shippingGbp: number = SHIPPING_GBP
): number {
  if (!Number.isFinite(resaleMedianGbp) || resaleMedianGbp <= 0) return 0;
  return Math.round(resaleMedianGbp - resaleMedianGbp * feeRate - shippingGbp);
}

/** One-line copy: best platform by modelled net; prefers live-scraped medians when flagged. */
export function pickBestResalePlatformLine(args: {
  platforms: { name: string; avgPrice: number; scraped?: boolean }[];
  feeRate?: number;
  shippingGbp?: number;
}): string {
  const feeRate = args.feeRate ?? PLATFORM_FEE_RATE;
  const shippingGbp = args.shippingGbp ?? SHIPPING_GBP;
  const pct = Math.round(feeRate * 100);

  const scrapedPool = args.platforms.filter(
    (p) => p.scraped === true && Number.isFinite(p.avgPrice) && p.avgPrice > 0
  );
  const pool =
    scrapedPool.length > 0
      ? scrapedPool
      : args.platforms.filter((p) => Number.isFinite(p.avgPrice) && p.avgPrice > 0);

  const ranked = pool
    .map((p) => ({
      name: p.name,
      net: netProceedsAfterFeesGbp(p.avgPrice, feeRate, shippingGbp),
    }))
    .sort((a, b) => b.net - a.net);

  if (ranked.length === 0) {
    return 'Insufficient live medians — compare platforms manually before you list.';
  }
  const best = ranked[0];
  if (ranked.length >= 2 && Math.abs(best.net - ranked[1].net) <= 1) {
    return `eBay, Vinted and Depop look similar after ~${pct}% fees and £${shippingGbp} shipping — list where you sell fastest.`;
  }
  return `Sell on ${best.name} — highest net profit after fees (~${pct}% + £${shippingGbp} ship)`;
}

/** Delta if condition moved one step toward LIKE_NEW, holding implied baseline = resale / mult(current). */
export function conditionUpgradeDeltaGbp(args: {
  resaleValueGbp: number;
  conditionGrade: string;
}): number | null {
  const { resaleValueGbp, conditionGrade } = args;
  const g = String(conditionGrade || 'GOOD').toUpperCase();
  const mult = CONDITION_MULTIPLIER[g] ?? 0.7;
  const idx = (CONDITION_GRADES_WORST_TO_BEST as readonly string[]).indexOf(g);
  if (idx < 0 || idx >= CONDITION_GRADES_WORST_TO_BEST.length - 1) return null;
  const nextGrade = CONDITION_GRADES_WORST_TO_BEST[idx + 1];
  const nextMult = CONDITION_MULTIPLIER[nextGrade];
  if (nextMult <= mult) return null;
  if (mult <= 0) return null;
  const impliedBase = resaleValueGbp / mult;
  const nextResale = impliedBase * nextMult;
  return Math.round(nextResale - resaleValueGbp);
}

export function parseAuthenticationFlags(raw: unknown): string[] {
  if (raw == null) return [];
  if (Array.isArray(raw)) return raw.map((x) => String(x).trim()).filter(Boolean);
  if (typeof raw === 'string') {
    const t = raw.trim();
    if (!t) return [];
    try {
      const p = JSON.parse(t) as unknown;
      if (Array.isArray(p)) return p.map((x) => String(x).trim()).filter(Boolean);
    } catch {
      /* single string flag */
    }
    return [t];
  }
  return [];
}
