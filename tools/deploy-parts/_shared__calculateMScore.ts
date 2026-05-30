/**
 * Marginn M-Score (0–100): weighted market + margin signals with tier-aware modifiers.
 *
 * weightedBase = Σ (weight_i × subscore_i)  [each subscore 0–10]
 * raw = weightedBase × conditionMult × seasonalMult × confidencePenalty
 * score = clamp(round(raw × 10), 0, 100)
 */

export type MScoreBrandTier = "HIGH" | "MED" | "LOW";
export type MScoreConditionGrade =
  | "LIKE_NEW"
  | "GOOD"
  | "LIGHT_WEAR"
  | "FADED"
  | "CRACKED_LOGO"
  | "STAINS"
  | "HEAVY_WEAR";

export interface CalculateMScoreInput {
  soldLast7: number;
  soldLast30: number;
  liveListings: number;
  avgPrice: number;
  minPrice: number;
  maxPrice: number;
  netProfit: number;
  brandTier: MScoreBrandTier;
  conditionGrade: string;
  itemType: string;
  brandConfidence: number;
  buyPrice: number;
  /** When < 5, sets lowConfidenceWarning. */
  listingCountUsed?: number;
  /** UTC month 1–12; defaults to now. */
  month?: number;
}

export interface MScoreBreakdown {
  velocityScore: number;
  marginScore: number;
  supplyGapScore: number;
  brandTierScore: number;
  stabilityScore: number;
}

export interface CalculateMScoreResult {
  score: number;
  verdict: "STRONG BUY" | "BUY" | "CAUTIOUS" | "SKIP";
  percentile: string;
  breakdown: MScoreBreakdown;
  multipliers: {
    condition: number;
    seasonal: number;
    confidence: number;
  };
  lowConfidenceWarning: boolean;
  signals: {
    velocityTrend: "accelerating" | "stable" | "slowing";
    supplyStatus: "undersupplied" | "balanced" | "oversupplied";
    marginHealth: "strong" | "moderate" | "weak";
  };
}

const WEIGHTS: Record<MScoreBrandTier, Record<string, number>> = {
  HIGH: { velocity: 0.2, margin: 0.2, supplyGap: 0.15, brandTier: 0.3, stability: 0.15 },
  MED: { velocity: 0.3, margin: 0.25, supplyGap: 0.2, brandTier: 0.15, stability: 0.1 },
  LOW: { velocity: 0.25, margin: 0.4, supplyGap: 0.15, brandTier: 0.1, stability: 0.1 },
};

const CONDITION_BY_TIER: Record<MScoreBrandTier, Record<string, number>> = {
  HIGH: {
    LIKE_NEW: 1.0,
    GOOD: 0.95,
    LIGHT_WEAR: 0.88,
    FADED: 0.7,
    CRACKED_LOGO: 0.55,
    STAINS: 0.4,
    HEAVY_WEAR: 0.35,
  },
  MED: {
    LIKE_NEW: 1.0,
    GOOD: 0.9,
    LIGHT_WEAR: 0.75,
    FADED: 0.55,
    CRACKED_LOGO: 0.4,
    STAINS: 0.25,
    HEAVY_WEAR: 0.2,
  },
  LOW: {
    LIKE_NEW: 1.0,
    GOOD: 0.8,
    LIGHT_WEAR: 0.55,
    FADED: 0.3,
    CRACKED_LOGO: 0.15,
    STAINS: 0.05,
    HEAVY_WEAR: 0.05,
  },
};

const COAT_JACKET_MONTH: Record<number, number> = {
  1: 0.7,
  2: 0.6,
  3: 0.5,
  4: 0.4,
  5: 0.3,
  6: 0.3,
  7: 0.4,
  8: 0.6,
  9: 0.9,
  10: 1.0,
  11: 1.0,
  12: 0.9,
};

const HOODIE_MONTH: Record<number, number> = {
  1: 0.9,
  2: 0.8,
  3: 0.7,
  4: 0.6,
  5: 0.5,
  6: 0.5,
  7: 0.6,
  8: 0.8,
  9: 1.0,
  10: 1.0,
  11: 0.9,
  12: 0.9,
};

const TEE_MONTH: Record<number, number> = {
  1: 0.6,
  2: 0.6,
  3: 0.7,
  4: 0.8,
  5: 1.0,
  6: 1.0,
  7: 1.0,
  8: 0.9,
  9: 0.7,
  10: 0.6,
  11: 0.5,
  12: 0.5,
};

function clamp(n: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, n));
}

function normalizeTier(raw: string): MScoreBrandTier {
  const u = raw.trim().toUpperCase();
  if (u === "HIGH") return "HIGH";
  if (u === "LOW") return "LOW";
  return "MED";
}

function normalizeCondition(raw: string): MScoreConditionGrade {
  const u = raw.trim().toUpperCase().replace(/\s+/g, "_");
  const allowed: MScoreConditionGrade[] = [
    "LIKE_NEW",
    "GOOD",
    "LIGHT_WEAR",
    "FADED",
    "CRACKED_LOGO",
    "STAINS",
    "HEAVY_WEAR",
  ];
  return (allowed.includes(u as MScoreConditionGrade) ? u : "GOOD") as MScoreConditionGrade;
}

function seasonalMultiplier(itemType: string, month: number): number {
  const t = itemType.toLowerCase();
  const m = clamp(month, 1, 12);
  if (/\b(coat|jacket|parka|puffer|gilet)\b/.test(t)) return COAT_JACKET_MONTH[m] ?? 0.9;
  if (/\b(hoodie|sweatshirt|crewneck|pullover)\b/.test(t)) return HOODIE_MONTH[m] ?? 0.9;
  if (/\b(t-?shirt|tee|tank)\b/.test(t)) return TEE_MONTH[m] ?? 0.9;
  if (/\b(trainer|sneaker|shoe|footwear)\b/.test(t)) return 1.0;
  return 0.9;
}

function velocityScore(soldLast7: number, soldLast30: number): { score: number; trend: number } {
  const recent = soldLast7 / 7;
  const olderDenom = Math.max(0, soldLast30 - soldLast7);
  const older = olderDenom / 23;
  const trend = older > 0.01 ? recent / older : recent > 0 ? 2 : 1;
  const score = Math.min(
    10,
    (soldLast30 / 20) * 10 * 0.7 + Math.min(trend, 2) * 0.3,
  );
  return { score: Math.max(0, score), trend };
}

function marginScore(netProfit: number): number {
  if (netProfit <= 0) return 0;
  return Math.min(10, Math.pow(netProfit / 10, 0.7) * 3.5);
}

function supplyGapScore(soldLast30: number, liveListings: number): { score: number; ratio: number } {
  const ratio = soldLast30 / Math.max(1, liveListings);
  return { score: Math.min(10, ratio * 3.5), ratio };
}

function brandTierScore(tier: MScoreBrandTier): number {
  if (tier === "HIGH") return 9.5;
  if (tier === "LOW") return 2.5;
  return 6.0;
}

function stabilityScore(avgPrice: number, minPrice: number, maxPrice: number): number {
  if (avgPrice <= 0) return 5;
  const cv = (maxPrice - minPrice) / avgPrice;
  return Math.max(0, 10 - cv * 8);
}

function confidencePenalty(confidence: number): number {
  if (confidence < 0.5) return 0.7;
  if (confidence < 0.7) return 0.88;
  return 1.0;
}

function verdictFromScore(score: number): CalculateMScoreResult["verdict"] {
  if (score > 75) return "STRONG BUY";
  if (score > 60) return "BUY";
  if (score > 40) return "CAUTIOUS";
  return "SKIP";
}

function percentileLabel(score: number): string {
  const top = clamp(100 - score, 1, 99);
  return `Top ${top}% of scans`;
}

export function calculateMScore(input: CalculateMScoreInput): CalculateMScoreResult {
  const tier = normalizeTier(input.brandTier);
  const cond = normalizeCondition(input.conditionGrade);
  const weights = WEIGHTS[tier];
  const month = input.month ?? new Date().getUTCMonth() + 1;

  const { score: velocityS, trend } = velocityScore(input.soldLast7, input.soldLast30);
  const marginS = marginScore(input.netProfit);
  const { score: supplyS, ratio: supplyRatio } = supplyGapScore(input.soldLast30, input.liveListings);
  const brandS = brandTierScore(tier);
  const stabilityS = stabilityScore(input.avgPrice, input.minPrice, input.maxPrice);

  const weightedBase =
    velocityS * weights.velocity +
    marginS * weights.margin +
    supplyS * weights.supplyGap +
    brandS * weights.brandTier +
    stabilityS * weights.stability;

  const conditionMult = CONDITION_BY_TIER[tier][cond] ?? CONDITION_BY_TIER.MED.GOOD;
  const seasonalMult = seasonalMultiplier(input.itemType, month);
  const confMult = confidencePenalty(input.brandConfidence);

  const raw = weightedBase * conditionMult * seasonalMult * confMult;
  const score = clamp(Math.round(raw * 10), 0, 100);

  const listingCount = input.listingCountUsed ?? input.soldLast30;
  const lowConfidenceWarning = listingCount < 5;

  let velocityTrend: CalculateMScoreResult["signals"]["velocityTrend"] = "stable";
  if (trend > 1.15) velocityTrend = "accelerating";
  else if (trend < 0.85) velocityTrend = "slowing";

  let supplyStatus: CalculateMScoreResult["signals"]["supplyStatus"] = "balanced";
  if (supplyRatio >= 2.5) supplyStatus = "undersupplied";
  else if (supplyRatio < 0.6) supplyStatus = "oversupplied";

  let marginHealth: CalculateMScoreResult["signals"]["marginHealth"] = "moderate";
  if (marginS >= 7) marginHealth = "strong";
  else if (marginS < 4) marginHealth = "weak";

  return {
    score,
    verdict: verdictFromScore(score),
    percentile: percentileLabel(score),
    breakdown: {
      velocityScore: Math.round(velocityS * 10) / 10,
      marginScore: Math.round(marginS * 10) / 10,
      supplyGapScore: Math.round(supplyS * 10) / 10,
      brandTierScore: Math.round(brandS * 10) / 10,
      stabilityScore: Math.round(stabilityS * 10) / 10,
    },
    multipliers: {
      condition: conditionMult,
      seasonal: seasonalMult,
      confidence: confMult,
    },
    lowConfidenceWarning,
    signals: {
      velocityTrend,
      supplyStatus,
      marginHealth,
    },
  };
}

/** Map brands row / item bucket to M-Score tier. */
export function mScoreTierFromBrandRow(brandRow: Record<string, unknown> | null, itemBucket: string): MScoreBrandTier {
  if (brandRow) {
    const dt = String(brandRow.display_tier ?? brandRow.brand_tier ?? "").trim().toUpperCase();
    if (dt === "HIGH" || dt === "LOW" || dt === "MED") return dt as MScoreBrandTier;
    const tier = String(brandRow.brand_tier ?? "").trim().toUpperCase();
    if (tier === "HIGH" || tier === "LOW" || tier === "MED") return tier as MScoreBrandTier;
  }
  const b = itemBucket.trim().toUpperCase();
  if (b === "HIGH" || b === "LOW") return b as MScoreBrandTier;
  return "MED";
}
