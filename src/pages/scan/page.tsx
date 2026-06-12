import { useState, useEffect, useRef } from 'react';
import SavedItems from './components/SavedItems';
import BoughtItems, { BoughtItem } from './components/BoughtItems';
import ScanResultCard from './components/ScanResultCard';
import type { ListingCacheRow } from './components/ScanResultCard';
import ScanProgress from './components/ScanProgress';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { supabase, edgeFunctionAuthHeaders } from '@/supabaseClient';
import { supabaseFunctionUrl, supabaseProjectUrl } from '../../lib/supabaseFunctions';
import {
  buildEffectiveMargin,
  encodeImageForScan,
  readNdjsonScanResponse,
  type AnalyseItemCompletePayload,
  type AnalyseItemMargin,
  type FlipScoreBreakdownPayload,
} from '../../lib/scanEdgeResponse';
import {
  formatScanErrorForDisplay,
  pipelineReportFromComplete,
  throwFromScanErrorPayload,
  type PipelineReport,
} from '../../lib/pipelineDiagnostics';
import { ensureScanPersisted } from '../../lib/ensureScanPersisted';
import {
  CONDITION_MULTIPLIER,
  isResaleDisplaySuppressed,
  MARGIN_BUFFER_GBP,
  PLATFORM_FEE_RATE,
  SHIPPING_GBP,
  parseAuthenticationFlags,
} from '../../lib/scanEconomics';
import { resolveAuthUserId } from '../../lib/authUserId';
import { countPeersSameBrand, formatBrandHistoryLine } from '../../lib/scanBrandAggregates';
import { watchlistUntilIso } from '../../lib/watchlistConstants';
import { MarkBoughtDialog, MarkSoldDialog } from '../dashboard/history/components/ScanOutcomeDialogs';
import {
  fetchForensicAuthentication,
  parseForensicAuthentication,
  type ForensicAuthentication,
} from '../../lib/forensicAuthentication';
import {
  applyComparableRemoval,
  hasAnyComparables,
  resolveComparablesFromScanPayload,
  tryEnhanceComparablesPayload,
  recalculateMScoreFromComparables,
  type ComparableListing,
  type ComparablesPayload,
} from '../../lib/findBestComparables';

const STRIPE_SUCCESS_URL = supabaseFunctionUrl('stripe-success');
const EDGE_FN_URL = supabaseFunctionUrl('analyse-item');

export interface IdentifiedItem {
  id: string;
  brand: string;
  productLine?: string;
  itemName: string;
  category: string;
  condition: string;
  imageUrl: string;
  retailPrice: number;
  purchaseCost?: number;
  scanMode?: string;
  verdict?: 'BUY' | 'MAYBE' | 'SKIP';
  resaleValue?: number;
  netProfit?: number;
  maxBuyPrice?: number;
  flags?: string[];
  explainFlags?: string[];
  gptVerified?: boolean;
  ebayCount?: number;
  scanId?: string;
  searchTerm?: string;
  platforms: {
    name: string;
    avgPrice: number;
    listings: number;
    soldListings: number;
    url: string;
    /** Live scrape succeeded (median meaningful) */
    scraped?: boolean;
  }[];
  priceHistory: {
    date: string;
    price: number;
  }[];
  /** ~12% selling fees on expected resale */
  platformFeeGbp?: number;
  /** 0.12 when supplied by edge `margin` */
  platformFeeRate?: number;
  /** Assumed outbound shipping (£) */
  shippingGbp?: number;
  /** £ buffer subtracted in max buy (from edge `margin.margin_buffer_gbp`) */
  marginBufferGbp?: number;
  /** Deterministic short id from Edge vision hash (or client fallback). */
  fingerprint?: string;
  /** Raw vision grade e.g. GOOD — for condition-upgrade hint */
  conditionGrade?: string;
  authenticationFlags?: string[];
  /** Optional Edge-supplied eBay price trend (% vs older sold comps). */
  ebayPriceTrendPct?: number | null;
  /** Resale from brand baseline / table — no live eBay sold median (aligns with Edge `used_fallback_resale`). */
  usedFallbackResale?: boolean;
  identificationFromCache?: boolean;
  scrapedAt?: string | null;
  priceExtractionMethod?: "vision" | "regex_fallback" | "finding_api";
  priceExtractionMethods?: {
    ebay?: "vision" | "regex_fallback" | "finding_api";
    vinted?: "vision" | "regex_fallback" | "finding_api";
    depop?: "vision" | "regex_fallback" | "finding_api";
  };
  /** Fewer than MIN_EBAY_SOLD_COMPS — hide resale £, show manual browse CTA. */
  insufficientSoldData?: boolean;
  ebaySoldCompCount?: number;
  /** Client clock when the complete payload arrived. */
  scanReceivedAtMs?: number;
  /** Data-backed flip score from Edge (`calculateFlipScore`); not Claude `trend_score`. */
  flipScore?: number | null;
  flipScoreBreakdown?: FlipScoreBreakdownPayload | null;
  soldVelocity?: { d7: number; d30: number } | null;
  /** Claude vision `trend_score` (0–15) — hints only (e.g. PRICE VOLATILE flag). */
  visionTrendHint?: number | null;
  /** Visible size text from vision (`size_label`). */
  sizeLabel?: string;
  /** `scans.share_token` for public `/share/scan/:token` link. */
  shareToken?: string;
  /** Claude forensic auth from `authenticate-item`. */
  forensicAuth?: ForensicAuthentication | null;
  forensicAuthScore?: number | null;
  forensicAuthVerdict?: string | null;
  forensicAuthLoading?: boolean;
  /** Marginn M-Score 0–100 from Edge `calculateMScore`. */
  mScore?: number | null;
  mScoreBreakdown?: Record<string, unknown> | null;
  /** Edge pipeline diagnosis (E-/U- codes, stages) — for support and UI hints. */
  pipelineReport?: PipelineReport | null;
  /** System-side partial failure message (E-*), when scan still completes. */
  pipelineSystemWarning?: string | null;
  comparables?: ComparablesPayload | null;
  comparablesAveragePrice?: number | null;
  comparablesOverallConfidence?: number | null;
  comparablesUnavailableReason?: string | null;
}

type ScanMode = 'Safe' | 'Standard' | 'Aggressive';

const SCAN_UPLOAD_TIP_KEY = 'marginn_scan_upload_tip_dismissed';
const MAX_STAGED_PHOTOS = 3;

type StagedPhoto = { id: string; file: File; preview: string };

function newPhotoId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

const PARTNER_SHOP_UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** Resolves `partner_shop_id` for Edge + fallback insert: `?shop=` must match profile when present. */
function resolvePartnerShopIdForScanBody(args: {
  profile: { role?: string; partner_shop_id?: string | null } | null;
  shopQuery: string | null;
  onShopMismatch: () => void;
}): string | undefined {
  const { profile, shopQuery, onShopMismatch } = args;
  if (!profile || profile.role !== 'partner' || !profile.partner_shop_id) return undefined;
  const mine = String(profile.partner_shop_id).trim();
  if (!mine) return undefined;
  const q = shopQuery?.trim() ?? '';
  if (q && PARTNER_SHOP_UUID_RE.test(q)) {
    if (q === mine) return mine;
    onShopMismatch();
    return undefined;
  }
  return mine;
}

/** Matches Edge `scanFingerprintFromVision` (FNV-1a) for offline consistency. */
function clientScanFingerprintFallback(item: IdentifiedItem): string {
  const key = [
    item.brand.trim(),
    (item.productLine ?? '').trim(),
    item.category.trim(),
    item.condition.trim(),
  ]
    .join('|')
    .toLowerCase();
  let h = 2166136261;
  for (let i = 0; i < key.length; i++) {
    h ^= key.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return ((h >>> 0).toString(16).padStart(8, '0')).slice(0, 10);
}

function mapSoldCompPreviews(raw: unknown, scanId: string): ListingCacheRow[] {
  if (!Array.isArray(raw) || !scanId) return [];
  return raw.slice(0, 12).map((row, i) => {
    const r = row as Record<string, unknown>;
    const price = r.price_gbp;
    return {
      id: String(r.id ?? `preview-${i}`),
      scan_id: String(r.scan_id ?? scanId),
      platform: String(r.platform ?? 'ebay'),
      title: typeof r.title === 'string' ? r.title : null,
      price_gbp: typeof price === 'number' ? price : Number(price) || null,
      image_url: typeof r.image_url === 'string' ? r.image_url : null,
      listing_url: typeof r.listing_url === 'string' ? r.listing_url : null,
      days_ago: typeof r.days_ago === 'number' ? r.days_ago : null,
    };
  });
}

function enrichIdentifiedWithTrust(
  item: IdentifiedItem,
  responseData: Record<string, unknown>,
  receivedAtMs: number
): IdentifiedItem {
  const ebayPlat = item.platforms.find((p) => p.name === 'eBay');
  const lp = responseData.livePrices as { ebay?: { scraped?: boolean; avg?: number } } | undefined;
  const ebayScraped =
    typeof ebayPlat?.scraped === 'boolean'
      ? ebayPlat.scraped
      : Boolean(lp?.ebay?.scraped && (lp.ebay?.avg ?? 0) > 0);

  const usedFallback =
    typeof responseData.used_fallback_resale === 'boolean'
      ? (responseData.used_fallback_resale as boolean)
      : !ebayScraped;

  const pem = responseData.price_extraction_method;
  const priceExtractionMethod =
    pem === 'vision' || pem === 'regex_fallback' || pem === 'finding_api' ? pem : undefined;
  const pemMap = responseData.price_extraction_methods;
  const priceExtractionMethods =
    pemMap && typeof pemMap === 'object' && !Array.isArray(pemMap)
      ? (pemMap as IdentifiedItem['priceExtractionMethods'])
      : undefined;

  const compCount =
    typeof responseData.ebay_sold_comp_count === 'number'
      ? responseData.ebay_sold_comp_count
      : undefined;

  const pipelineReport = pipelineReportFromComplete(responseData);
  const pipelineSystemWarning =
    pipelineReport?.issue_category === 'system' && pipelineReport.pipeline_status !== 'ok'
      ? pipelineReport.user_message
      : null;

  return {
    ...item,
    usedFallbackResale: usedFallback,
    identificationFromCache: responseData.identification_from_cache === true,
    scrapedAt: typeof responseData.scraped_at === 'string' ? responseData.scraped_at : null,
    priceExtractionMethod,
    priceExtractionMethods,
    insufficientSoldData: isResaleDisplaySuppressed(responseData),
    ebaySoldCompCount: compCount,
    scanReceivedAtMs: receivedAtMs,
    pipelineReport: pipelineReport ?? null,
    pipelineSystemWarning,
  };
}

const MODE_CONFIG: Record<ScanMode, { label: string; desc: string; color: string; active: string }> = {
  Safe: {
    label: 'Safe',
    desc: 'Lower risk, conservative margins',
    color: 'border-gray-200 text-gray-500',
    active: 'border-emerald-500 bg-emerald-50 text-emerald-700',
  },
  Standard: {
    label: 'Standard',
    desc: 'Balanced risk and reward',
    color: 'border-gray-200 text-gray-500',
    active: 'border-amber-500 bg-amber-50 text-amber-700',
  },
  Aggressive: {
    label: 'Aggressive',
    desc: 'Higher risk, maximum profit',
    color: 'border-gray-200 text-gray-500',
    active: 'border-rose-500 bg-rose-50 text-rose-700',
  },
};

const CONDITION_LABEL: Record<string, string> = {
  LIKE_NEW: 'Like New',
  GOOD: 'Good Condition',
  LIGHT_WEAR: 'Light Wear',
  FADED: 'Faded',
  CRACKED_LOGO: 'Cracked Logo',
  STAINS: 'Stains',
  HEAVY_WEAR: 'Heavy Wear',
};

function isUnknownBrandLabel(s: string): boolean {
  const t = s.trim().toLowerCase();
  return !t || t === 'unknown' || t === 'unknown brand' || t === 'n/a' || t === 'none';
}

function displayBrandFromAi(aiData: Record<string, unknown>): string {
  const raw = String(aiData.brand_name ?? '').trim();
  if (!isUnknownBrandLabel(raw)) return raw;
  const sub = String(aiData.sub_brand ?? '').trim();
  if (sub && !isUnknownBrandLabel(sub)) return sub;
  const parts = [aiData.category, aiData.style, aiData.item_type]
    .map((x) => String(x ?? '').trim())
    .filter((p) => p && !isUnknownBrandLabel(p));
  return parts.length ? `${parts.join(' ')} (brand unclear)` : 'Unknown Brand';
}

function sizeLabelFromAi(ai: Record<string, unknown>): string | undefined {
  const s = String(ai.size_label ?? '').trim();
  return s || undefined;
}

function deriveVerdict(netProfit: number, mode: ScanMode): 'BUY' | 'MAYBE' | 'SKIP' {
  if (mode === 'Safe') return netProfit >= 30 ? 'BUY' : netProfit >= 10 ? 'MAYBE' : 'SKIP';
  if (mode === 'Aggressive') return netProfit >= 10 ? 'BUY' : netProfit >= 0 ? 'MAYBE' : 'SKIP';
  return netProfit >= 20 ? 'BUY' : netProfit >= 5 ? 'MAYBE' : 'SKIP';
}

function applyAnalyseItemMargin(
  item: IdentifiedItem,
  margin: AnalyseItemMargin,
  mode: ScanMode
): IdentifiedItem {
  const hasBuy = margin.buy_price_gbp != null && margin.net_profit_gbp != null;
  return {
    ...item,
    resaleValue: margin.resale_gbp,
    platformFeeGbp: margin.platform_fee_gbp,
    shippingGbp: margin.shipping_gbp,
    maxBuyPrice: margin.max_buy_price_gbp,
    marginBufferGbp: margin.margin_buffer_gbp,
    platformFeeRate: margin.platform_fee_rate,
    purchaseCost: margin.buy_price_gbp ?? item.purchaseCost,
    netProfit: hasBuy ? margin.net_profit_gbp! : item.netProfit,
    verdict: hasBuy ? deriveVerdict(margin.net_profit_gbp!, mode) : item.verdict,
    platforms: item.platforms.map((p) =>
      p.name === 'eBay' ? { ...p, avgPrice: margin.resale_gbp } : p
    ),
  };
}

function buildResultFromAI(
  aiData: Record<string, unknown>,
  brandRow: Record<string, unknown> | null,
  buyPriceStr: string,
  mode: ScanMode,
  imageUrl: string,
  livePrices?: {
    ebay: { avg: number; listings: number; soldCount: number; scraped: boolean };
    vinted: { avg: number; listings: number; scraped: boolean };
    depop: { avg: number; listings: number; scraped: boolean };
  }
): IdentifiedItem {
  const brandName = displayBrandFromAi(aiData);
  const conditionGrade = (aiData.condition_grade as string) || 'GOOD';
  const conditionLabel = CONDITION_LABEL[conditionGrade] ?? conditionGrade;
  const conditionMult = CONDITION_MULTIPLIER[conditionGrade] ?? 0.7;
  const brandConfidenceRaw = Number(aiData.brand_confidence ?? 0);
  const brandConfidence =
    brandConfidenceRaw > 0 && brandConfidenceRaw <= 1
      ? brandConfidenceRaw
      : brandConfidenceRaw > 1
        ? brandConfidenceRaw / 100
        : 0;
  const visionTrendHint = Number(aiData.trend_score ?? 5) || 5;
  const colour = (aiData.colour as string) ?? '';
  const gender = (aiData.gender as string) ?? '';

  // eBay sold listings already reflect real market prices for items in any condition.
  // Use eBay avg directly as resaleValue — NO condition multiplier on top.
  // Only fall back to brand baseline × condition multiplier if eBay has no data.
  const brandBaselineRaw = brandRow ? Number(brandRow.baseline_resale_gbp ?? 40) : 40;
  const brandBaseline =
    Number.isFinite(brandBaselineRaw) && brandBaselineRaw > 0 ? brandBaselineRaw : 40;
  const resaleFromEbay =
    livePrices?.ebay.scraped && livePrices.ebay.avg > 0
      ? Math.round(livePrices.ebay.avg)
      : 0;
  const resaleFromAlt =
    livePrices?.vinted.scraped && livePrices.vinted.avg > 0
      ? Math.round(livePrices.vinted.avg)
      : livePrices?.depop.scraped && livePrices.depop.avg > 0
        ? Math.round(livePrices.depop.avg)
        : 0;
  const resaleValue =
    resaleFromEbay > 0
      ? resaleFromEbay
      : resaleFromAlt > 0
        ? resaleFromAlt
        : Math.max(12, Math.round(brandBaseline * conditionMult));

  // Platform prices: prefer live scraped data, fall back to brand table ranges
  const brandVintedFallback = brandRow
    ? Math.round(((Number(brandRow.vinted_min ?? 0) + Number(brandRow.vinted_max ?? 0)) / 2) * conditionMult)
    : Math.round(resaleValue * 0.9);
  const brandDepopFallback = brandRow
    ? Math.round(((Number(brandRow.depop_min ?? 0) + Number(brandRow.depop_max ?? 0)) / 2) * conditionMult)
    : Math.round(resaleValue * 1.0);

  const vintedAvg = (livePrices?.vinted.scraped && livePrices.vinted.avg > 0)
    ? livePrices.vinted.avg
    : (brandVintedFallback || resaleValue);
  const ebayAvg = resaleValue; // eBay avg IS the resale value
  const depopAvg = (livePrices?.depop.scraped && livePrices.depop.avg > 0)
    ? livePrices.depop.avg
    : (brandDepopFallback || resaleValue);

  const ebayListings = livePrices?.ebay.scraped ? livePrices.ebay.listings : 0;
  const ebaySoldCount = livePrices?.ebay.scraped ? livePrices.ebay.soldCount : 0;

  const buyPriceNum = buyPriceStr ? parseFloat(buyPriceStr) : 0;
  const platformFees = Math.round(resaleValue * PLATFORM_FEE_RATE);
  const netProfit = Math.round(resaleValue - buyPriceNum - platformFees - SHIPPING_GBP);
  const maxBuyPrice = Math.round(
    resaleValue - platformFees - SHIPPING_GBP - MARGIN_BUFFER_GBP
  );
  const verdict = deriveVerdict(netProfit, mode);

  const flags: string[] = [];
  if (brandConfidence < 0.6) flags.push('LOW CONFIDENCE');
  if (['FADED', 'CRACKED_LOGO', 'STAINS', 'HEAVY_WEAR'].includes(conditionGrade)) flags.push('CONDITION PENALTY');
  if (mode === 'Aggressive') flags.push('HIGH COMPETITION');
  if (visionTrendHint >= 12) flags.push('PRICE VOLATILE');

  const itemDesc = [colour, gender, brandName].filter(Boolean).join(' ');

  return {
    id: Date.now().toString(),
    brand: brandName,
    itemName: itemDesc || brandName,
    category: (brandRow?.category_default as string) ?? 'Clothing',
    condition: conditionLabel,
    imageUrl,
    retailPrice: Math.round(resaleValue * 1.8),
    purchaseCost: buyPriceNum || undefined,
    scanMode: mode,
    verdict,
    resaleValue,
    netProfit,
    maxBuyPrice,
    flags,
    platforms: [
      {
        name: 'Vinted',
        avgPrice: vintedAvg,
        listings: livePrices?.vinted.scraped ? livePrices.vinted.listings : 0,
        soldListings: 0,
        url: 'https://vinted.co.uk',
        scraped: Boolean(livePrices?.vinted.scraped && livePrices.vinted.avg > 0),
      },
      {
        name: 'Depop',
        avgPrice: depopAvg,
        listings: livePrices?.depop.scraped ? livePrices.depop.listings : 0,
        soldListings: 0,
        url: 'https://depop.com',
        scraped: Boolean(livePrices?.depop.scraped && livePrices.depop.avg > 0),
      },
      {
        name: 'eBay',
        avgPrice: ebayAvg,
        listings: ebayListings,
        soldListings: ebaySoldCount,
        url: 'https://ebay.co.uk',
        scraped: Boolean(livePrices?.ebay.scraped && livePrices.ebay.avg > 0),
      },
    ],
    priceHistory: [
      { date: '2024-01', price: Math.round(resaleValue * 0.85) },
      { date: '2024-02', price: Math.round(resaleValue * 0.88) },
      { date: '2024-03', price: Math.round(resaleValue * 0.92) },
      { date: '2024-04', price: Math.round(resaleValue * 0.96) },
      { date: '2024-05', price: resaleValue },
      { date: '2024-06', price: Math.round(resaleValue * 1.02) },
    ],
    platformFeeGbp: platformFees,
    shippingGbp: SHIPPING_GBP,
    conditionGrade,
    authenticationFlags: parseAuthenticationFlags(
      aiData.authentication_flags ?? aiData.authenticationFlags
    ),
    sizeLabel: sizeLabelFromAi(aiData),
  };
}

/** Stage A: identification only (no live prices / margin — UI uses `pricesLoading` skeletons). */
function buildPartialIdentifiedFromStreamAnalysis(
  data: Record<string, unknown>,
  mode: ScanMode,
  previewImageUrl: string,
  buyPriceStr: string
): IdentifiedItem {
  const imageUrl =
    typeof data.imageUrl === 'string' && data.imageUrl.trim()
      ? data.imageUrl.trim()
      : previewImageUrl;

  const scanId =
    (typeof data.scanId === 'string' && data.scanId.trim()) ||
    (typeof data.scan_id === 'string' && data.scan_id.trim()) ||
    undefined;

  const searchQuery = typeof data.searchQuery === 'string' ? data.searchQuery.trim() : '';
  const buyPriceNum = buyPriceStr ? parseFloat(buyPriceStr) : 0;

  const fpRaw = data.fingerprint;
  const fingerprintFromEdge = typeof fpRaw === 'string' && fpRaw.trim() ? fpRaw.trim() : '';

  const placeholderPlatforms: IdentifiedItem['platforms'] = [
    { name: 'Vinted', avgPrice: 0, listings: 0, soldListings: 0, url: 'https://vinted.co.uk' },
    { name: 'Depop', avgPrice: 0, listings: 0, soldListings: 0, url: 'https://depop.com' },
    { name: 'eBay', avgPrice: 0, listings: 0, soldListings: 0, url: 'https://ebay.co.uk' },
  ];

  const emptyPlatforms = placeholderPlatforms;

  // Nested `{ ai, brand, ... }` shape (legacy Edge payload)
  if (data.ai && typeof data.ai === 'object') {
    const ai = data.ai as Record<string, unknown>;
    const brandRow = (data.brand as Record<string, unknown> | null) ?? null;
    const brandName = displayBrandFromAi(ai);
    const conditionGrade = (ai.condition_grade as string) || 'GOOD';
    const conditionLabel = CONDITION_LABEL[conditionGrade] ?? conditionGrade;
    const brandConfidenceRaw = Number(ai.brand_confidence ?? 0);
    const brandConfidence =
      brandConfidenceRaw > 0 && brandConfidenceRaw <= 1
        ? brandConfidenceRaw
        : brandConfidenceRaw > 1
          ? brandConfidenceRaw / 100
          : 0;
    const visionTrendHint = Number(ai.trend_score ?? 5) || 5;
    const colour = (ai.colour as string) ?? '';
    const gender = (ai.gender as string) ?? '';
    const productLine =
      [String(ai.sub_brand ?? ''), String(ai.item_type ?? '')].filter(Boolean).join(' · ') || undefined;
    const itemDesc = [colour, gender, brandName].filter(Boolean).join(' ');

    const flags: string[] = [];
    if (brandConfidence < 0.6) flags.push('LOW CONFIDENCE');
    if (['FADED', 'CRACKED_LOGO', 'STAINS', 'HEAVY_WEAR'].includes(conditionGrade)) flags.push('CONDITION PENALTY');
    if (mode === 'Aggressive') flags.push('HIGH COMPETITION');
    if (visionTrendHint >= 12) flags.push('PRICE VOLATILE');

    const category = (brandRow?.category_default as string) ?? 'Clothing';
    const conditionGradeUpper = String(conditionGrade).toUpperCase();
    const base: IdentifiedItem = {
      id: `stream-partial-${Date.now()}`,
      brand: brandName,
      productLine,
      itemName: itemDesc || brandName,
      category,
      condition: conditionLabel,
      imageUrl,
      retailPrice: 0,
      purchaseCost: buyPriceNum || undefined,
      scanMode: mode,
      platforms: emptyPlatforms,
      priceHistory: [],
      flags,
      searchTerm: searchQuery || [brandName, productLine].filter(Boolean).join(' ') || brandName,
      scanId,
      conditionGrade: conditionGradeUpper,
      authenticationFlags: parseAuthenticationFlags(
        ai.authentication_flags ?? ai.authenticationFlags
      ),
      ebayPriceTrendPct: null,
      sizeLabel: sizeLabelFromAi(ai),
    };
    return {
      ...base,
      fingerprint: fingerprintFromEdge || clientScanFingerprintFallback(base),
    };
  }

  // Flat new-API shape on stream chunk
  const brandName = displayBrandFromAi(data);
  const conditionGrade = (data.condition_grade as string) || 'GOOD';
  const conditionLabel = CONDITION_LABEL[conditionGrade] ?? conditionGrade;
  const conditionGradeUpper = String(conditionGrade).toUpperCase();
  const brandConfidence = (data.brand_confidence as number) ?? 0;
  const conf01 = brandConfidence > 1 ? brandConfidence / 100 : brandConfidence;
  const flags: string[] = [];
  if (conf01 < 0.6) flags.push('LOW CONFIDENCE');
  if (['FADED', 'CRACKED_LOGO', 'STAINS', 'HEAVY_WEAR'].includes(conditionGrade)) flags.push('CONDITION PENALTY');
  if (mode === 'Aggressive') flags.push('HIGH COMPETITION');

  const productLine = (data.product_line as string) || undefined;
  const base: IdentifiedItem = {
    id: `stream-partial-${Date.now()}`,
    brand: brandName,
    productLine,
    itemName: productLine || brandName,
    category: 'Clothing',
    condition: conditionLabel,
    imageUrl,
    retailPrice: 0,
    purchaseCost: buyPriceNum || undefined,
    scanMode: mode,
    platforms: emptyPlatforms,
    priceHistory: [],
    flags,
    explainFlags: (data.explain_flags as string[]) ?? [],
    gptVerified: (data.gpt_verified as boolean) ?? false,
    searchTerm: searchQuery || [brandName, productLine].filter(Boolean).join(' ') || brandName,
    scanId,
    conditionGrade: conditionGradeUpper,
    authenticationFlags: parseAuthenticationFlags(
      data.authentication_flags ?? data.authenticationFlags
    ),
    ebayPriceTrendPct: null,
    sizeLabel: sizeLabelFromAi(data),
  };
  return {
    ...base,
    fingerprint: fingerprintFromEdge || clientScanFingerprintFallback(base),
  };
}

function buildResultFromNewAPI(
  data: Record<string, unknown>,
  buyPriceStr: string,
  mode: ScanMode,
  imageUrl: string
): IdentifiedItem {
  const brandName = displayBrandFromAi(data);
  const productLine = (data.product_line as string) || '';
  const conditionGrade = (data.condition_grade as string) || 'GOOD';
  const cgNorm = String(conditionGrade).toUpperCase();
  const conditionLabel = CONDITION_LABEL[conditionGrade] ?? conditionGrade;
  const brandConfidence = (data.brand_confidence as number) ?? 0;
  const cgFlat = String(data.condition_grade ?? 'GOOD').toUpperCase();
  const resalePrice =
    typeof data.resale_price === 'number' && data.resale_price > 0
      ? Math.round(data.resale_price as number)
      : buildEffectiveMargin(data, cgFlat).resale_gbp;
  const netAfterFees = (data.net_after_fees as number) ?? 0;
  const profitFromAPI = (data.profit as number) ?? 0;
  const platformFeesCalc = Math.round(resalePrice * PLATFORM_FEE_RATE);
  const maxBuyFromApi = (data.max_buy as number) ?? 0;
  const maxBuy =
    maxBuyFromApi > 0
      ? maxBuyFromApi
      : Math.round(resalePrice - platformFeesCalc - SHIPPING_GBP - MARGIN_BUFFER_GBP);
  const decision = (data.decision as string) ?? 'MAYBE';
  const explainFlags = (data.explain_flags as string[]) ?? [];
  const gptVerified = (data.gpt_verified as boolean) ?? false;
  const ebayCount = (data.ebay_count as number) ?? 0;
  const platformPrices = (data.platform_prices as { ebay: number | null; vinted: number | null; depop: number | null }) ?? {};

  const buyPriceNum = buyPriceStr ? parseFloat(buyPriceStr) : 0;

  // Map decision to verdict
  const verdictMap: Record<string, 'BUY' | 'MAYBE' | 'SKIP'> = { BUY: 'BUY', MAYBE: 'MAYBE', SKIP: 'SKIP' };
  const verdict: 'BUY' | 'MAYBE' | 'SKIP' = verdictMap[decision] ?? 'MAYBE';

  // Use profit from API if buy price was entered, otherwise use net_after_fees as proxy
  const netProfit = buyPriceNum > 0 ? profitFromAPI : netAfterFees;

  const flags: string[] = [];
  const conf01 = brandConfidence > 1 ? brandConfidence / 100 : brandConfidence;
  if (conf01 < 0.6) flags.push('LOW CONFIDENCE');
  if (['FADED', 'CRACKED_LOGO', 'STAINS', 'HEAVY_WEAR'].includes(conditionGrade)) flags.push('CONDITION PENALTY');
  if (mode === 'Aggressive') flags.push('HIGH COMPETITION');

  const ebayPrice = platformPrices.ebay ?? resalePrice;
  const vintedPrice = platformPrices.vinted ?? Math.round(resalePrice * 0.9);
  const depopPrice = platformPrices.depop ?? Math.round(resalePrice * 1.0);

  return {
    id: Date.now().toString(),
    brand: brandName,
    productLine,
    itemName: productLine || brandName,
    category: 'Clothing',
    condition: conditionLabel,
    imageUrl,
    retailPrice: Math.round(resalePrice * 1.8),
    purchaseCost: buyPriceNum || undefined,
    scanMode: mode,
    verdict,
    resaleValue: resalePrice,
    netProfit,
    maxBuyPrice: maxBuy,
    flags,
    explainFlags,
    gptVerified,
    ebayCount,
    conditionGrade,
    authenticationFlags: parseAuthenticationFlags(
      data.authentication_flags ?? data.authenticationFlags
    ),
    platforms: [
      {
        name: 'Vinted',
        avgPrice: vintedPrice,
        listings: 0,
        soldListings: 0,
        url: 'https://vinted.co.uk',
        scraped: platformPrices.vinted != null && platformPrices.vinted > 0,
      },
      {
        name: 'Depop',
        avgPrice: depopPrice,
        listings: 0,
        soldListings: 0,
        url: 'https://depop.com',
        scraped: platformPrices.depop != null && platformPrices.depop > 0,
      },
      {
        name: 'eBay',
        avgPrice: ebayPrice,
        listings: ebayCount,
        soldListings: ebayCount,
        url: 'https://ebay.co.uk',
        scraped: platformPrices.ebay != null && platformPrices.ebay > 0,
      },
    ],
    priceHistory: [
      { date: '2024-01', price: Math.round(resalePrice * 0.85) },
      { date: '2024-02', price: Math.round(resalePrice * 0.88) },
      { date: '2024-03', price: Math.round(resalePrice * 0.92) },
      { date: '2024-04', price: Math.round(resalePrice * 0.96) },
      { date: '2024-05', price: resalePrice },
      { date: '2024-06', price: Math.round(resalePrice * 1.02) },
    ],
    platformFeeGbp: platformFeesCalc,
    shippingGbp: SHIPPING_GBP,
    sizeLabel: sizeLabelFromAi(data),
  };
}

const MOCK_BOUGHT_ITEMS: BoughtItem[] = [
  {
    id: 'b1',
    brand: 'Stone Island',
    itemName: 'Ghost Piece Overshirt',
    imageUrl: 'https://readdy.ai/api/search-image?query=Stone%20Island%20ghost%20piece%20overshirt%20fashion%20streetwear%20clothing%20on%20clean%20white%20background%20minimal%20product%20photography%20high%20quality&width=400&height=300&seq=bought1&orientation=landscape',
    paidPrice: 45,
    predictedResalePrice: 95,
    status: 'BOUGHT',
  },
  {
    id: 'b2',
    brand: 'Nike',
    itemName: 'Air Max 90 Infrared',
    imageUrl: 'https://readdy.ai/api/search-image?query=Nike%20Air%20Max%2090%20sneakers%20shoes%20on%20clean%20white%20background%20minimal%20product%20photography%20high%20quality%20studio&width=400&height=300&seq=bought2&orientation=landscape',
    paidPrice: 30,
    predictedResalePrice: 75,
    status: 'BOUGHT',
  },
  {
    id: 'b3',
    brand: 'Ralph Lauren',
    itemName: 'Polo Bear Knit Sweater',
    imageUrl: 'https://readdy.ai/api/search-image?query=Ralph%20Lauren%20polo%20bear%20knit%20sweater%20fashion%20clothing%20on%20clean%20white%20background%20minimal%20product%20photography%20high%20quality&width=400&height=300&seq=bought3&orientation=landscape',
    paidPrice: 18,
    predictedResalePrice: 55,
    status: 'BOUGHT',
  },
  {
    id: 'b4',
    brand: 'Carhartt WIP',
    itemName: 'Detroit Jacket Brown',
    imageUrl: 'https://readdy.ai/api/search-image?query=Carhartt%20WIP%20Detroit%20jacket%20brown%20workwear%20fashion%20clothing%20on%20clean%20white%20background%20minimal%20product%20photography&width=400&height=300&seq=bought4&orientation=landscape',
    paidPrice: 25,
    predictedResalePrice: 68,
    status: 'BOUGHT',
  },
];

interface ScanPageProps {
  embedded?: boolean;
}

export default function ScanPage({ embedded = false }: ScanPageProps) {
  const [activeTab, setActiveTab] = useState<'scan' | 'results' | 'saved' | 'bought'>('scan');
  const [identifiedItem, setIdentifiedItem] = useState<IdentifiedItem | null>(null);
  const [savedItems, setSavedItems] = useState<IdentifiedItem[]>([]);
  const [boughtItems, setBoughtItems] = useState<BoughtItem[]>(MOCK_BOUGHT_ITEMS);
  const [stagedPhotos, setStagedPhotos] = useState<StagedPhoto[]>([]);
  const [buyPrice, setBuyPrice] = useState('');
  const [scanMode, setScanMode] = useState<ScanMode>('Standard');
  const [isScanning, setIsScanning] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [scanStep, setScanStep] = useState(1);
  const [brandsCount, setBrandsCount] = useState<number | null>(null);
  const [ebayListings, setEbayListings] = useState<ListingCacheRow[]>([]);
  const [comparables, setComparables] = useState<ComparablesPayload | null>(null);
  const [comparablesUnavailableReason, setComparablesUnavailableReason] = useState<string | null>(
    null
  );
  const [removedComparableIds, setRemovedComparableIds] = useState<Set<string>>(() => new Set());
  const [flagsOpen, setFlagsOpen] = useState(false);
  /** True after `analysis` NDJSON event until full merge from `complete`. */
  const [pricesLoading, setPricesLoading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { user, session, profile, signOut, refreshProfile, decrementScan } = useAuth();
  const { showToast } = useToast();
  const [userDropdown, setUserDropdown] = useState(false);
  const userDropdownRef = useRef<HTMLDivElement>(null);
  const [showUploadTip, setShowUploadTip] = useState(() => {
    try {
      return localStorage.getItem(SCAN_UPLOAD_TIP_KEY) !== '1';
    } catch {
      return true;
    }
  });
  const [brandHistoryLine, setBrandHistoryLine] = useState<string | null>(null);
  const [watchlistActive, setWatchlistActive] = useState(false);
  const [watchUntilLabel, setWatchUntilLabel] = useState<string | null>(null);
  const [watchPriceBusy, setWatchPriceBusy] = useState(false);
  const [outcomeRow, setOutcomeRow] = useState<{
    bought_at: string | null;
    sold_at: string | null;
    bought_price_gbp: number | null;
    buy_price_gbp: number | null;
  } | null>(null);
  const [boughtDialogOpen, setBoughtDialogOpen] = useState(false);
  const [soldDialogOpen, setSoldDialogOpen] = useState(false);
  const forensicAuthScanIdRef = useRef<string | null>(null);

  const dismissUploadTip = () => {
    try {
      localStorage.setItem(SCAN_UPLOAD_TIP_KEY, '1');
    } catch {
      /* ignore */
    }
    setShowUploadTip(false);
  };

  useEffect(() => {
    const raw = profile?.default_mode?.toUpperCase();
    if (raw === 'SAFE') setScanMode('Safe');
    else if (raw === 'AGGRESSIVE') setScanMode('Aggressive');
    else if (raw === 'STANDARD') setScanMode('Standard');
  }, [profile?.default_mode]);

  // Fetch eBay listing cards when a new scan result comes in
  useEffect(() => {
    if (!identifiedItem?.scanId) {
      setEbayListings([]);
      return;
    }
    supabase
      .from('listing_cache')
      .select('*')
      .eq('scan_id', identifiedItem.scanId)
      .eq('platform', 'ebay')
      .limit(12)
      .then(({ data, error: fetchErr }) => {
        if (fetchErr) console.error('listing_cache fetch error:', fetchErr);
        else if (data) setEbayListings(data as ListingCacheRow[]);
      });
  }, [identifiedItem?.scanId]);

  useEffect(() => {
    if (!identifiedItem?.scanId || !identifiedItem.brand) {
      setBrandHistoryLine(null);
      return;
    }
    let cancelled = false;
    void (async () => {
      const uid = await resolveAuthUserId(user?.id ?? session?.user?.id);
      if (!uid || cancelled) return;
      const { data, error } = await supabase
        .from('scans')
        .select('id, brand_name, roi')
        .eq('user_id', uid)
        .limit(2000);
      if (error || cancelled || !data) return;
      const { otherCount, avgRoiPct } = countPeersSameBrand(
        data as { id: string; brand_name: string | null; roi: number | null }[],
        identifiedItem.brand,
        identifiedItem.scanId
      );
      setBrandHistoryLine(formatBrandHistoryLine(identifiedItem.brand, otherCount, avgRoiPct));
    })();
    return () => {
      cancelled = true;
    };
  }, [identifiedItem?.scanId, identifiedItem?.brand, user?.id, session?.user?.id]);

  useEffect(() => {
    if (!identifiedItem?.scanId) {
      setOutcomeRow(null);
      setWatchlistActive(false);
      setWatchUntilLabel(null);
      return;
    }
    let cancelled = false;
    void (async () => {
      const uid = await resolveAuthUserId(user?.id ?? session?.user?.id);
      if (!uid) return;
      const [{ data: scanRow }, { data: wlRow }] = await Promise.all([
        supabase
          .from('scans')
          .select('bought_at, sold_at, bought_price_gbp, buy_price_gbp')
          .eq('id', identifiedItem.scanId)
          .eq('user_id', uid)
          .maybeSingle(),
        supabase
          .from('scan_watchlist')
          .select('created_at')
          .eq('scan_id', identifiedItem.scanId)
          .eq('user_id', uid)
          .maybeSingle(),
      ]);
      if (cancelled) return;
      setOutcomeRow(
        scanRow as {
          bought_at: string | null;
          sold_at: string | null;
          bought_price_gbp: number | null;
          buy_price_gbp: number | null;
        } | null
      );
      if (wlRow?.created_at) {
        setWatchlistActive(true);
        setWatchUntilLabel(
          new Date(watchlistUntilIso(wlRow.created_at as string)).toLocaleString('en-GB', {
            dateStyle: 'medium',
            timeStyle: 'short',
          })
        );
      } else {
        setWatchlistActive(false);
        setWatchUntilLabel(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [identifiedItem?.scanId, user?.id, session?.user?.id]);

  // Handle Stripe payment success redirect
  useEffect(() => {
    const paymentSuccess = searchParams.get('payment_success');
    const sessionId = searchParams.get('session_id');
    const plan = searchParams.get('plan');

    if (paymentSuccess !== '1' || !sessionId) return;

    // Clean up URL immediately
    navigate('/scan', { replace: true });

    const verifyPayment = async () => {
      try {
        const { data: sessionData } = await supabase.auth.getSession();
        const paySession = sessionData.session ?? session;
        const headers = await edgeFunctionAuthHeaders({ session: paySession });
        const res = await fetch(STRIPE_SUCCESS_URL, {
          method: 'POST',
          headers,
          body: JSON.stringify({ session_id: sessionId }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? 'Payment verification failed');

        await refreshProfile();

        const planLabels: Record<string, string> = {
          drop_in: '10 scans added',
          scout: '75 scans/month — Scout activated',
          trader: 'Unlimited scans — Trader activated',
          pro: 'Unlimited scans — Pro activated',
        };
        const label = planLabels[plan ?? ''] ?? 'Plan activated';
        showToast(`Payment successful — ${label}`, 'success');
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Could not verify payment';
        showToast(msg, 'error');
      }
    };

    verifyPayment();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Close dropdown on outside click
  useEffect(() => {
    function handleOutside(e: MouseEvent) {
      if (userDropdownRef.current && !userDropdownRef.current.contains(e.target as Node)) {
        setUserDropdown(false);
      }
    }
    document.addEventListener('mousedown', handleOutside);
    return () => document.removeEventListener('mousedown', handleOutside);
  }, []);

  const handleSignOut = async () => {
    setUserDropdown(false);
    await signOut();
    showToast('Signed out successfully', 'success');
    navigate('/');
  };

  useEffect(() => {
    const anon = import.meta.env.VITE_PUBLIC_SUPABASE_ANON_KEY as string | undefined;
    if (!anon) return;
    fetch(`${supabaseProjectUrl()}/rest/v1/brands?select=*`, {
      headers: {
        apikey: anon,
        Authorization: `Bearer ${anon}`,
        "Content-Type": "application/json",
        Prefer: "count=exact",
      },
    })
      .then(async (r) => {
        const count = r.headers.get('content-range');
        const data = await r.json();
        const total = count ? parseInt(count.split('/')[1], 10) : (Array.isArray(data) ? data.length : 0);
        setBrandsCount(total);
      })
      .catch((e) => console.log('Error:', e));
  }, []);

  const addStagedFiles = (files: FileList | File[]) => {
    const list = Array.from(files as unknown as File[]).filter((f) => f.type.startsWith('image/'));
    if (list.length === 0) {
      setError('Please select image files');
      return;
    }
    setError(null);
    setStagedPhotos((prev) => {
      const next = [...prev];
      for (const file of list) {
        if (next.length >= MAX_STAGED_PHOTOS) break;
        if (file.size > 10 * 1024 * 1024) {
          setError('Each file must be under 10MB');
          continue;
        }
        next.push({ id: newPhotoId(), file, preview: URL.createObjectURL(file) });
      }
      return next;
    });
  };

  const removeStagedPhoto = (id: string) => {
    setStagedPhotos((prev) => {
      const t = prev.find((p) => p.id === id);
      if (t) URL.revokeObjectURL(t.preview);
      return prev.filter((p) => p.id !== id);
    });
  };

  const clearAllStagedPhotos = () => {
    setStagedPhotos((prev) => {
      prev.forEach((p) => URL.revokeObjectURL(p.preview));
      return [];
    });
  };

  const prepareNewPhotoCapture = () => {
    clearAllStagedPhotos();
    setError(null);
    setActiveTab('scan');
    requestAnimationFrame(() => fileInputRef.current?.click());
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    if (e.dataTransfer.files?.length) addStagedFiles(e.dataTransfer.files);
  };

  const handleScan = async () => {
    if (stagedPhotos.length === 0) return;
    const snapPhotos = [...stagedPhotos];
    const heroPreviewUrl = snapPhotos[0]?.preview ?? '';
    setIsScanning(true);
    setError(null);
    setScanStep(1);
    setEbayListings([]);
    setComparables(null);
    setComparablesUnavailableReason(null);
    setRemovedComparableIds(new Set());
    setPricesLoading(true);

    let scanCompleted = false;
    try {
      const encodedList = await Promise.all(snapPhotos.map((p) => encodeImageForScan(p.file)));
      if (encodedList.some((e) => !e.base64)) {
        throw new Error('Failed to prepare image');
      }

      const { data: sessionData } = await supabase.auth.getSession();
      const scanSession = sessionData.session ?? session;
      // Prefer session from storage over React state — state can lag after refresh or
      // fast navigation, which would skip scans fallback insert and decrementScan.
      const effectiveUserId = scanSession?.user?.id ?? user?.id ?? undefined;
      if (!effectiveUserId) {
        setError('You need to be signed in to save scans. Please sign in and try again.');
        setIsScanning(false);
        setScanStep(1);
        return;
      }

      const shopParam = searchParams.get('shop');
      const partnerShopForBody = resolvePartnerShopIdForScanBody({
        profile,
        shopQuery: shopParam,
        onShopMismatch: () =>
          showToast('That shop link does not match your partner account.', 'error'),
      });

      const scanBody: Record<string, unknown> = {
        buy_price: buyPrice ? parseFloat(buyPrice) : 0,
        mode: scanMode.toLowerCase(),
        user_id: effectiveUserId,
        stream: true,
        ...(partnerShopForBody ? { partner_shop_id: partnerShopForBody } : {}),
      };
      if (encodedList.length === 1) {
        const e = encodedList[0]!;
        scanBody.image_base64 = `data:${e.mimeType};base64,${e.base64}`;
        scanBody.image_type = e.mimeType;
      } else {
        scanBody.images = encodedList.map((e) => ({
          base64: `data:${e.mimeType};base64,${e.base64}`,
          mime: e.mimeType,
        }));
      }

      const edgeHeaders = await edgeFunctionAuthHeaders({ session: scanSession });
      if (!edgeHeaders.Authorization) {
        console.warn('[Scan] No access token on analyse-item request — history may not save');
      }

      const res = await fetch(EDGE_FN_URL, {
        method: 'POST',
        headers: edgeHeaders,
        body: JSON.stringify(scanBody),
      });

      if (!res.ok) {
        const errData = (await res.json().catch(() => ({}))) as Record<string, unknown>;
        throwFromScanErrorPayload(errData, res.status);
      }

      const contentType = res.headers.get('content-type') ?? '';
      let responseData: Record<string, unknown>;
      if (contentType.includes('application/x-ndjson')) {
        responseData = await readNdjsonScanResponse(res, {
          onAnalysis: () => setScanStep(2),
          onAnalysisData: (analysisData) => {
            setPricesLoading(true);
            setIdentifiedItem(
              buildPartialIdentifiedFromStreamAnalysis(
                analysisData,
                scanMode,
                heroPreviewUrl,
                buyPrice
              )
            );
            setActiveTab('results');
          },
        });
        setScanStep(3);
        await new Promise<void>((r) => setTimeout(r, 280));
        setScanStep(4);
        await new Promise<void>((r) => setTimeout(r, 220));
      } else {
        setPricesLoading(false);
        responseData = (await res.json()) as Record<string, unknown>;
        setScanStep(2);
        await new Promise<void>((r) => setTimeout(r, 650));
        setScanStep(3);
        await new Promise<void>((r) => setTimeout(r, 900));
        setScanStep(4);
        await new Promise<void>((r) => setTimeout(r, 650));
      }

      // Support both new flat structure and legacy { ai, brand, livePrices } structure
      let result: IdentifiedItem;
      if (responseData.brand_name !== undefined) {
        result = buildResultFromNewAPI(responseData, buyPrice, scanMode, heroPreviewUrl);
        // Always set searchTerm — use edge function query or fall back to brand + product line
        result.searchTerm = ((responseData.searchQuery as string) || '').trim()
          || [result.brand, result.productLine].filter(Boolean).join(' ');
        if (responseData.scanId) result.scanId = responseData.scanId as string;
      } else {
        const { ai, brand, livePrices, searchQuery, scanId } = responseData as {
          ai: Record<string, unknown>;
          brand: Record<string, unknown> | null;
          livePrices?: {
            ebay: { avg: number; listings: number; soldCount: number; scraped: boolean };
            vinted: { avg: number; listings: number; scraped: boolean };
            depop: { avg: number; listings: number; scraped: boolean };
          };
          searchQuery?: string;
          scanId?: string;
        };
        result = buildResultFromAI(ai, brand, buyPrice, scanMode, heroPreviewUrl, livePrices);
        // Always set searchTerm — use edge function query or fall back to brand + item name
        result.searchTerm = (searchQuery || '').trim() || result.brand;
        if (scanId) result.scanId = scanId;
      }

      const scanIdFromApi =
        (typeof responseData.scanId === 'string' && responseData.scanId.trim()) ||
        (typeof (responseData as { scan_id?: unknown }).scan_id === 'string' &&
          (responseData as { scan_id: string }).scan_id.trim()) ||
        undefined;
      if (scanIdFromApi) result.scanId = scanIdFromApi;

      const cgForMargin = String(
        (responseData as { ai?: Record<string, unknown> }).ai?.condition_grade ??
          result.conditionGrade ??
          'GOOD'
      ).toUpperCase();
      const buyNum = buyPrice ? parseFloat(buyPrice) : 0;
      const effectiveMargin = buildEffectiveMargin(
        responseData,
        cgForMargin,
        buyNum > 0 ? buyNum : undefined
      );
      result = applyAnalyseItemMargin(result, effectiveMargin, scanMode);

      const lpAfter = responseData.livePrices as
        | {
            ebay?: { avg?: number; listings?: number; soldCount?: number; scraped?: boolean };
            vinted?: { avg?: number; listings?: number; scraped?: boolean };
            depop?: { avg?: number; listings?: number; scraped?: boolean };
          }
        | undefined;
      if (lpAfter) {
        result = {
          ...result,
          platforms: result.platforms.map((p) => {
            if (p.name === 'eBay' && lpAfter.ebay) {
              const avg = effectiveMargin.resale_gbp;
              return {
                ...p,
                avgPrice: avg,
                listings: lpAfter.ebay.listings ?? p.listings,
                soldListings: lpAfter.ebay.soldCount ?? p.soldListings,
                scraped: Boolean(lpAfter.ebay.scraped || avg > 0),
              };
            }
            if (p.name === 'Vinted' && lpAfter.vinted?.avg && lpAfter.vinted.avg > 0) {
              return {
                ...p,
                avgPrice: Math.round(lpAfter.vinted.avg),
                listings: lpAfter.vinted.listings ?? p.listings,
                scraped: true,
              };
            }
            if (p.name === 'Depop' && lpAfter.depop?.avg && lpAfter.depop.avg > 0) {
              return {
                ...p,
                avgPrice: Math.round(lpAfter.depop.avg),
                listings: lpAfter.depop.listings ?? p.listings,
                scraped: true,
              };
            }
            return p;
          }),
        };
      }

      const fpRaw = (responseData as { fingerprint?: unknown }).fingerprint;
      const fingerprintFromEdge = typeof fpRaw === 'string' && fpRaw.trim() ? fpRaw.trim() : '';
      const aiNormSource =
        responseData.brand_name !== undefined
          ? (responseData as Record<string, unknown>)
          : (responseData as { ai?: Record<string, unknown> }).ai ?? {};
      const authMerged = parseAuthenticationFlags(
        aiNormSource.authentication_flags ?? aiNormSource.authenticationFlags
      );
      const cgNorm = String(aiNormSource.condition_grade ?? result.conditionGrade ?? 'GOOD').toUpperCase();
      const trendUnknown = (responseData as { ebay_price_trend_pct?: unknown }).ebay_price_trend_pct;
      const ebayTrendPct =
        typeof trendUnknown === 'number' && Number.isFinite(trendUnknown) ? trendUnknown : null;

      const completeFlip = responseData as AnalyseItemCompletePayload;
      const flipScore =
        typeof completeFlip.flip_score === 'number' && Number.isFinite(completeFlip.flip_score)
          ? completeFlip.flip_score
          : null;
      const flipScoreBreakdown =
        completeFlip.flip_score_breakdown &&
        typeof completeFlip.flip_score_breakdown === 'object' &&
        !Array.isArray(completeFlip.flip_score_breakdown)
          ? (completeFlip.flip_score_breakdown as FlipScoreBreakdownPayload)
          : null;
      const svTop = completeFlip.sold_velocity;
      const soldVelocityFromTop =
        svTop &&
        typeof svTop === 'object' &&
        typeof svTop.d7 === 'number' &&
        typeof svTop.d30 === 'number'
          ? { d7: svTop.d7, d30: svTop.d30 }
          : null;
      const soldVelocity =
        soldVelocityFromTop ??
        (flipScoreBreakdown?.sold_velocity &&
        typeof flipScoreBreakdown.sold_velocity.d7 === 'number' &&
        typeof flipScoreBreakdown.sold_velocity.d30 === 'number'
          ? {
              d7: flipScoreBreakdown.sold_velocity.d7,
              d30: flipScoreBreakdown.sold_velocity.d30,
            }
          : null);
      const visionTrendHintRaw = completeFlip.vision_trend_hint;
      const visionTrendHint =
        typeof visionTrendHintRaw === 'number' && Number.isFinite(visionTrendHintRaw)
          ? visionTrendHintRaw
          : (typeof aiNormSource.trend_score === 'number' ? aiNormSource.trend_score : null);

      const mScore =
        typeof completeFlip.m_score === 'number' && Number.isFinite(completeFlip.m_score)
          ? completeFlip.m_score
          : null;
      const mScoreBreakdown =
        completeFlip.m_score_breakdown &&
        typeof completeFlip.m_score_breakdown === 'object' &&
        !Array.isArray(completeFlip.m_score_breakdown)
          ? (completeFlip.m_score_breakdown as Record<string, unknown>)
          : null;

      const authFromComplete = parseForensicAuthentication(
        completeFlip.authentication ?? responseData.authentication
      );

      result = {
        ...result,
        fingerprint: fingerprintFromEdge || clientScanFingerprintFallback(result),
        conditionGrade: cgNorm,
        authenticationFlags:
          authMerged.length > 0 ? authMerged : (result.authenticationFlags ?? []),
        ebayPriceTrendPct: ebayTrendPct ?? result.ebayPriceTrendPct ?? null,
        flipScore,
        flipScoreBreakdown,
        soldVelocity,
        visionTrendHint,
        mScore,
        mScoreBreakdown,
        forensicAuth: authFromComplete,
        forensicAuthScore:
          typeof completeFlip.authentication_score === 'number'
            ? completeFlip.authentication_score
            : authFromComplete
              ? Math.round(authFromComplete.confidence * 100)
              : null,
        forensicAuthVerdict:
          typeof completeFlip.authentication_verdict === 'string'
            ? completeFlip.authentication_verdict
            : authFromComplete?.verdict ?? null,
      };

      result = enrichIdentifiedWithTrust(result, responseData, Date.now());

      const completePayload = responseData as AnalyseItemCompletePayload;
      const { payload: comparablesParsed, unavailableReason: comparablesReason } =
        resolveComparablesFromScanPayload(completePayload as Record<string, unknown>);

      let finalComparables = comparablesParsed;
      if (comparablesParsed && hasAnyComparables(comparablesParsed)) {
        const aiForComps = (responseData as { ai?: Record<string, unknown> }).ai ?? {};
        finalComparables = await tryEnhanceComparablesPayload(
          comparablesParsed,
          {
            brand: result.brand || String(aiForComps.brand_name ?? ''),
            itemType:
              result.productLine ||
              result.itemName ||
              String(aiForComps.item_type ?? aiForComps.sub_brand ?? ''),
            colour: String(aiForComps.colour ?? aiForComps.color ?? ''),
            condition: String(result.conditionGrade ?? aiForComps.condition_grade ?? 'GOOD'),
          },
          comparablesParsed.m_score_recalc
        );
      }

      setComparables(finalComparables);
      setComparablesUnavailableReason(comparablesReason);
      if (finalComparables) {
        result = {
          ...result,
          comparables: finalComparables,
          comparablesAveragePrice:
            typeof completePayload.comparables_average_price === 'number' && !finalComparables.average_price
              ? completePayload.comparables_average_price
              : finalComparables.average_price,
          comparablesOverallConfidence:
            finalComparables.overall_confidence > 0
              ? finalComparables.overall_confidence
              : typeof completePayload.comparables_overall_confidence === 'number'
                ? completePayload.comparables_overall_confidence
                : finalComparables.overall_confidence,
        };
      }

      if (result.pipelineReport) {
        console.info('[Scan] pipeline_report', {
          status: result.pipelineReport.pipeline_status,
          code: result.pipelineReport.primary_code,
          category: result.pipelineReport.issue_category,
          stages: result.pipelineReport.stages,
        });
      }
      const previews = mapSoldCompPreviews(responseData.sold_comp_previews, result.scanId ?? '');
      if (previews.length > 0) {
        setEbayListings(previews);
      }

      const shareTok = (responseData as AnalyseItemCompletePayload).share_token;
      if (typeof shareTok === 'string' && shareTok.trim()) {
        result = { ...result, shareToken: shareTok.trim() };
      }

      const economicsPayload =
        previews.length > 0
          ? { ...responseData, sold_comp_previews: responseData.sold_comp_previews ?? previews }
          : responseData;
      const finalMargin = buildEffectiveMargin(
        economicsPayload,
        cgNorm,
        buyNum > 0 ? buyNum : undefined
      );
      result = applyAnalyseItemMargin(result, finalMargin, scanMode);
      if (isResaleDisplaySuppressed(economicsPayload)) {
        result = {
          ...result,
          insufficientSoldData: true,
          ebaySoldCompCount:
            typeof economicsPayload.ebay_sold_comp_count === 'number'
              ? economicsPayload.ebay_sold_comp_count
              : result.ebaySoldCompCount,
          verdict: 'MAYBE',
        };
      }

      scanCompleted = true;
      setIdentifiedItem({ ...result, forensicAuthLoading: !result.forensicAuth });
      setPricesLoading(false);
      setActiveTab('results');

      const primaryEncoded = encodedList[0]!;
      const scanIdForAuth = result.scanId;
      if (scanIdForAuth && !result.forensicAuth) {
        forensicAuthScanIdRef.current = scanIdForAuth;
        void fetchForensicAuthentication({
          session: scanSession,
          encoded: primaryEncoded,
          brandName: result.brand,
          itemType: result.itemName || result.productLine || '',
          userId: effectiveUserId,
          scanId: scanIdForAuth,
        }).then((authPayload) => {
          if (!authPayload) {
            setIdentifiedItem((prev) =>
              prev && prev.scanId === scanIdForAuth ? { ...prev, forensicAuthLoading: false } : prev
            );
            return;
          }
          setIdentifiedItem((prev) => {
            if (!prev || prev.scanId !== scanIdForAuth) return prev;
            return {
              ...prev,
              forensicAuth: authPayload.authentication,
              forensicAuthScore: authPayload.authentication_score,
              forensicAuthVerdict: authPayload.authentication_verdict,
              forensicAuthLoading: false,
            };
          });
        });
      }

      clearAllStagedPhotos();

      const persist = (responseData as AnalyseItemCompletePayload).scanPersist;
      const persistedImageUrl =
        (responseData as { imageUrl?: string }).imageUrl?.trim() || null;
      const buyPriceNum = buyPrice ? parseFloat(buyPrice) : 0;

      let persistOk = true;
      if (effectiveUserId && result.scanId) {
        const persistOutcome = await ensureScanPersisted({
          scanId: result.scanId,
          userId: effectiveUserId,
          result,
          responseData,
          scanMode,
          buyPriceNum,
          imageUrl: persistedImageUrl,
          partnerShopId: partnerShopForBody,
          edgePersist: persist,
        });
        if (!persistOutcome.ok) {
          persistOk = false;
          const pe = persist?.error;
          showToast(
            pe
              ? `Could not save scan to history (${pe.code}: ${pe.message}). ${persistOutcome.message ?? ''}`
              : `Could not save scan to history: ${persistOutcome.message ?? persistOutcome.reason}`,
            'error',
          );
        } else {
          console.log('[Scan] history row ok', persistOutcome.source, result.scanId);
          setIdentifiedItem((prev) =>
            prev ? { ...prev, pipelineSystemWarning: null } : prev,
          );
        }
      } else if (!result.scanId) {
        console.warn('[Scan] no scanId returned from edge function — scan_id FK will be null on save');
      } else if (!effectiveUserId) {
        console.warn('[Scan] no user id — scan not saved to history');
      }
      // ─────────────────────────────────────────────────────────────────────

      // ── Decrement scan count for limited-plan users ───────────────────────
      if (persistOk) {
        try {
          await decrementScan();
        } catch (decrementErr) {
          console.error('[Scan] Failed to decrement scan count:', decrementErr);
        }
      }
      // ─────────────────────────────────────────────────────────────────────

    } catch (err: unknown) {
      const msg = formatScanErrorForDisplay(err);
      console.warn('[Scan] failed:', err);
      setError(msg);
      setPricesLoading(false);
    } finally {
      setIsScanning(false);
      if (!scanCompleted) setScanStep(1);
    }
  };

  const handleSaveItem = async (item: IdentifiedItem) => {
    console.log('[Scan] starting save', {
      itemId: item.id,
      scanId: item.scanId ?? 'NONE — FK will be null',
      brand: item.brand,
      userId: user?.id ?? 'NOT LOGGED IN',
    });

    // Save to local state first so UI responds immediately
    setSavedItems((prev) => (prev.find((i) => i.id === item.id) ? prev : [...prev, item]));

    if (!user?.id) {
      console.warn('[Scan] save skipped — no user logged in, saved to local state only');
      return;
    }

    try {
      const payload = {
        user_id: user.id,
        // scan_id is safe to pass now — scans row was upserted when result loaded
        scan_id: item.scanId ?? null,
        brand_name: item.brand,
        product_line: item.productLine ?? null,
        image_url: item.imageUrl,
        resale_price: item.resaleValue ?? null,
        profit: item.netProfit ?? null,
        decision: item.verdict ?? null,
        buy_price: item.purchaseCost ?? null,
      };
      console.log('[Scan] inserting saved_items row', payload);

      const { data, error: insertErr } = await supabase.from('saved_items').insert(payload);
      if (insertErr) {
        console.error('[Scan] save FAILED — Supabase insert error:', {
          code: insertErr.code,
          message: insertErr.message,
          details: insertErr.details,
          hint: insertErr.hint,
        });
      } else {
        console.log('[Scan] save complete', data);
      }
    } catch (err) {
      console.error('[Scan] save FAILED — unexpected error:', err);
    }
  };

  const handleRemoveItem = (id: string) => {
    setSavedItems((prev) => prev.filter((item) => item.id !== id));
  };

  const handleMarkAsSold = (
    id: string,
    data: { actualSalePrice: number; platform: string; daysToSell: number }
  ) => {
    setBoughtItems((prev) =>
      prev.map((item) =>
        item.id === id ? { ...item, status: 'SOLD', soldData: data } : item
      )
    );
  };

  const defaultMarkBoughtPriceGbp = (() => {
    if (buyPrice.trim()) {
      const n = parseFloat(buyPrice);
      return Number.isFinite(n) && n > 0 ? n : null;
    }
    const pc = identifiedItem?.purchaseCost;
    if (pc != null && pc > 0) return pc;
    const bp = outcomeRow?.buy_price_gbp;
    return bp != null && Number(bp) > 0 ? Number(bp) : null;
  })();

  const handleWatchPriceResult = async () => {
    const scanId = identifiedItem?.scanId;
    if (!scanId) return;
    const uid = await resolveAuthUserId(user?.id ?? session?.user?.id);
    if (!uid) {
      showToast('Sign in to watch resale.', 'error');
      return;
    }
    const baseline = identifiedItem?.resaleValue ?? 0;
    setWatchPriceBusy(true);
    const { data, error } = await supabase
      .from('scan_watchlist')
      .insert({ user_id: uid, scan_id: scanId, baseline_resale_gbp: baseline })
      .select('created_at')
      .maybeSingle();
    setWatchPriceBusy(false);
    if (error) {
      if (error.code === '23505' || (error.message && error.message.toLowerCase().includes('duplicate'))) {
        showToast('Already watching this scan.', 'info');
      } else {
        showToast(error.message, 'error');
      }
      return;
    }
    setWatchlistActive(true);
    if (data?.created_at) {
      setWatchUntilLabel(
        new Date(watchlistUntilIso(data.created_at as string)).toLocaleString('en-GB', {
          dateStyle: 'medium',
          timeStyle: 'short',
        })
      );
    }
    showToast('Watching resale for 48h from now.', 'success');
  };

  const handleRemoveComparable = async (listing: ComparableListing) => {
    if (!comparables) return;
    const nextRemoved = new Set(removedComparableIds);
    nextRemoved.add(listing.id);
    const updated = applyComparableRemoval(comparables, listing.id);
    setRemovedComparableIds(nextRemoved);
    setComparables(updated);

    const mRecalc = recalculateMScoreFromComparables(updated, nextRemoved);
    const avg = updated.average_price;

    setIdentifiedItem((prev) => {
      if (!prev) return prev;
      let next: IdentifiedItem = {
        ...prev,
        comparables: updated,
        comparablesAveragePrice: avg,
        mScore: mRecalc?.score ?? prev.mScore,
        mScoreBreakdown: mRecalc?.breakdown ?? prev.mScoreBreakdown,
      };
      if (avg != null && avg > 0 && !prev.insufficientSoldData) {
        const platformFees = Math.round(avg * (prev.platformFeeRate ?? PLATFORM_FEE_RATE));
        const shipping = prev.shippingGbp ?? SHIPPING_GBP;
        const buffer = prev.marginBufferGbp ?? MARGIN_BUFFER_GBP;
        const buy = prev.purchaseCost ?? 0;
        const netProfit = Math.round(avg - buy - platformFees - shipping);
        next = {
          ...next,
          resaleValue: Math.round(avg),
          netProfit,
          maxBuyPrice: Math.max(0, Math.round(avg - platformFees - shipping - buffer)),
          platformFeeGbp: platformFees,
          platforms: next.platforms.map((p) =>
            p.name === 'eBay' ? { ...p, avgPrice: Math.round(avg) } : p
          ),
        };
      }
      return next;
    });

    void (async () => {
      const uid = await resolveAuthUserId(user?.id ?? session?.user?.id);
      if (!uid) return;
      const { error } = await supabase.from('comparable_removals').insert({
        item_brand: identifiedItem?.brand ?? '',
        item_type: identifiedItem?.productLine ?? identifiedItem?.itemName ?? '',
        removed_listing_title: listing.title,
        match_score: listing.match_percent / 100,
        platform: listing.platform,
        user_id: uid,
      });
      if (error) console.warn('[comparable_removals] insert:', error.message);
    })();
  };

  const handleMarkBoughtResult = async (price: number | null) => {
    const scanId = identifiedItem?.scanId;
    if (!scanId) return;
    const uid = await resolveAuthUserId(user?.id ?? session?.user?.id);
    if (!uid) return;
    const boughtAtIso = new Date().toISOString();
    const { error } = await supabase
      .from('scans')
      .update({ bought_at: boughtAtIso, bought_price_gbp: price })
      .eq('id', scanId)
      .eq('user_id', uid);
    if (error) {
      showToast(error.message, 'error');
      return;
    }
    setOutcomeRow((prev) => ({
      bought_at: boughtAtIso,
      sold_at: prev?.sold_at ?? null,
      bought_price_gbp: price,
      buy_price_gbp: prev?.buy_price_gbp ?? null,
    }));
    showToast('Marked as bought.', 'success');
    setBoughtDialogOpen(false);
  };

  const handleMarkSoldResult = async (soldPrice: number) => {
    const scanId = identifiedItem?.scanId;
    if (!scanId) return;
    const uid = await resolveAuthUserId(user?.id ?? session?.user?.id);
    if (!uid) return;
    const soldAtIso = new Date().toISOString();
    const { error } = await supabase
      .from('scans')
      .update({ sold_at: soldAtIso, sold_price_gbp: soldPrice })
      .eq('id', scanId)
      .eq('user_id', uid);
    if (error) {
      showToast(error.message, 'error');
      return;
    }
    setOutcomeRow((prev) => ({
      bought_at: prev?.bought_at ?? null,
      sold_at: soldAtIso,
      bought_price_gbp: prev?.bought_price_gbp ?? null,
      buy_price_gbp: prev?.buy_price_gbp ?? null,
    }));
    showToast('Sale recorded.', 'success');
    setSoldDialogOpen(false);
  };

  const showScanCount =
    profile && ['free', 'drop_in', 'scout'].includes(profile.plan ?? 'free');

  const primaryPreview = stagedPhotos[0]?.preview ?? null;
  const hasStaged = stagedPhotos.length > 0;

  // ── EMBEDDED TWO-COLUMN LAYOUT ─────────────────────────────────────────────
  if (embedded) {
    return (
      <>
      <div className="bg-white rounded-2xl border border-gray-100 p-6 w-full">
        <div className="flex gap-6 w-full">

          {/* ── LEFT COLUMN — 45% ── */}
          <div className="w-[45%] flex-shrink-0 flex flex-col gap-4">
            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1.5">What you pay in-store (£)</label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm font-medium">£</span>
                <input
                  type="number"
                  value={buyPrice}
                  onChange={(e) => setBuyPrice(e.target.value)}
                  placeholder="Enter buy price"
                  min="0"
                  step="0.01"
                  className="w-full pl-7 pr-4 py-3 bg-white border border-gray-200 rounded-lg text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-[#1a3d2b]/20 focus:border-[#1a3d2b]/40 transition-all"
                />
              </div>
              <p className="text-[10px] text-gray-400 mt-1">Used for net profit — set before you scan.</p>
            </div>

            {/* Upload / Preview area */}
            <div
              onDrop={handleDrop}
              onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
              onDragLeave={() => setDragOver(false)}
              onClick={() => !hasStaged && fileInputRef.current?.click()}
              className={`relative w-full rounded-xl border-2 border-dashed overflow-hidden transition-all cursor-pointer ${
                hasStaged
                  ? 'border-transparent'
                  : dragOver
                  ? 'border-[#1a3d2b] bg-[#1a3d2b]/5'
                  : 'border-gray-200 bg-white hover:border-gray-300 hover:bg-gray-50'
              }`}
              style={{ aspectRatio: '4/3' }}
            >
              {hasStaged ? (
                <div className="absolute inset-0 p-2 grid grid-cols-3 gap-2 bg-white">
                  {stagedPhotos.map((p) => (
                    <div key={p.id} className="relative rounded-lg overflow-hidden border border-gray-100 min-h-0">
                      <img src={p.preview} alt="" className="w-full h-full object-cover" />
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          removeStagedPhoto(p.id);
                        }}
                        className="absolute top-1 right-1 w-6 h-6 flex items-center justify-center bg-white/90 rounded-full shadow-sm hover:bg-white cursor-pointer"
                        aria-label="Remove photo"
                      >
                        <i className="ri-close-line text-gray-700 text-xs" />
                      </button>
                    </div>
                  ))}
                  {stagedPhotos.length < MAX_STAGED_PHOTOS && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        fileInputRef.current?.click();
                      }}
                      className="rounded-lg border-2 border-dashed border-gray-200 flex flex-col items-center justify-center gap-1 text-gray-400 hover:border-[#1a3d2b]/40 hover:text-[#1a3d2b] cursor-pointer min-h-0"
                    >
                      <i className="ri-add-line text-lg" />
                      <span className="text-[9px] font-medium">Add</span>
                    </button>
                  )}
                </div>
              ) : (
                <>
                  <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 p-6 text-center">
                    <div className="w-14 h-14 flex items-center justify-center rounded-xl bg-gray-100">
                      <i className="ri-camera-line text-2xl text-gray-400"></i>
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-gray-700">Add 1–3 photos</p>
                      <p className="text-xs text-gray-400 mt-1">Drag and drop or click to browse</p>
                    </div>
                    <p className="text-xs text-gray-300">JPG, PNG, WEBP · Max 10MB each</p>
                  </div>
                  {showUploadTip && (
                    <div
                      role="status"
                      className="absolute bottom-2 left-2 right-2 z-20 rounded-xl border border-[#1a3d2b]/25 bg-white/95 shadow-md p-3 flex gap-2 items-start text-left"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <div className="flex-1 min-w-0">
                        <p className="text-[11px] font-bold text-[#1a3d2b] uppercase tracking-wide">First time?</p>
                        <p className="text-[11px] text-gray-600 mt-1 leading-snug">
                          Upload starts here — click the box or drop a photo to scan.
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          dismissUploadTip();
                        }}
                        className="flex-shrink-0 w-7 h-7 flex items-center justify-center rounded-lg text-gray-500 hover:bg-gray-100 cursor-pointer"
                        aria-label="Dismiss tip"
                      >
                        <i className="ri-close-line text-lg" />
                      </button>
                    </div>
                  )}
                </>
              )}
            </div>

            {/* Hidden inputs */}
            <input
              ref={cameraInputRef}
              type="file"
              accept="image/*"
              capture="environment"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) addStagedFiles([f]);
                e.target.value = '';
              }}
            />
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              multiple
              className="hidden"
              onChange={(e) => {
                if (e.target.files?.length) addStagedFiles(e.target.files);
                e.target.value = '';
              }}
            />

            {/* Error */}
            {error && (
              <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-lg px-3 py-2.5">
                <i className="ri-error-warning-line text-red-500 text-sm"></i>
                <p className="text-xs text-red-700">{error}</p>
              </div>
            )}

            {/* Scan button */}
            <button
              onClick={handleScan}
              disabled={!hasStaged || isScanning}
              className="w-full py-3.5 rounded-lg text-sm font-semibold text-white transition-all disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer whitespace-nowrap flex items-center justify-center gap-2"
              style={{ backgroundColor: '#1a3d2b' }}
            >
              {isScanning ? (
                <>
                  <i className="ri-loader-4-line animate-spin text-base"></i>
                  Scanning...
                </>
              ) : (
                <>
                  <i className="ri-scan-2-line text-base"></i>
                  Scan Item
                </>
              )}
            </button>

          </div>

          {/* ── RIGHT COLUMN — 55% ── */}
          <div className="flex-1 min-w-0">

            {/* Scanning overlay */}
            {isScanning && !identifiedItem && (
              <div className="h-full flex items-center justify-center">
                <ScanProgress currentStep={scanStep} />
              </div>
            )}

            {/* Empty state */}
            {!isScanning && !identifiedItem && (
              <div className="h-full flex flex-col items-center justify-center text-center py-12 px-6">
                <div className="w-16 h-16 flex items-center justify-center bg-gray-100 rounded-xl mb-4">
                  <i className="ri-search-line text-3xl text-gray-300"></i>
                </div>
                <p className="text-sm font-medium text-gray-500 mb-1">Upload an image to see</p>
                <p className="text-sm text-gray-400">resale analytics</p>
              </div>
            )}

            {/* Results */}
            {identifiedItem && (
              <div className="h-full overflow-y-auto pr-1">
                <ScanResultCard
                  imageUrl={identifiedItem.imageUrl}
                  brand={identifiedItem.brand}
                  productLine={identifiedItem.productLine}
                  condition={identifiedItem.condition}
                  verdict={identifiedItem.verdict ?? 'BUY'}
                  resaleValue={identifiedItem.resaleValue ?? 0}
                  netProfit={identifiedItem.netProfit ?? 0}
                  maxBuyPrice={identifiedItem.maxBuyPrice ?? 0}
                  platforms={identifiedItem.platforms}
                  flags={identifiedItem.flags ?? []}
                  explainFlags={identifiedItem.explainFlags ?? []}
                  gptVerified={identifiedItem.gptVerified ?? false}
                  ebayCount={identifiedItem.ebayCount ?? 0}
                  ebayListings={ebayListings}
                  searchTerm={identifiedItem.searchTerm}
                  purchaseCost={identifiedItem.purchaseCost}
                  platformFeeGbp={identifiedItem.platformFeeGbp}
                  platformFeeRate={identifiedItem.platformFeeRate}
                  shippingGbp={identifiedItem.shippingGbp}
                  marginBufferGbp={identifiedItem.marginBufferGbp}
                  fingerprint={identifiedItem.fingerprint}
                  conditionGrade={identifiedItem.conditionGrade}
                  authenticationFlags={identifiedItem.authenticationFlags}
                  ebayPriceTrendPct={identifiedItem.ebayPriceTrendPct}
                  flipScore={identifiedItem.flipScore}
                  flipScoreBreakdown={identifiedItem.flipScoreBreakdown}
                  soldVelocity={identifiedItem.soldVelocity}
                  scanId={identifiedItem.scanId ?? null}
                  onWatchPrice={handleWatchPriceResult}
                  watchPriceBusy={watchPriceBusy}
                  onWatchlist={watchlistActive}
                  watchUntilLabel={watchUntilLabel}
                  brandHistoryLine={brandHistoryLine}
                  boughtAt={outcomeRow?.bought_at ?? null}
                  soldAt={outcomeRow?.sold_at ?? null}
                  usedFallbackResale={identifiedItem.usedFallbackResale ?? false}
                  scrapedAtIso={identifiedItem.scrapedAt ?? null}
                  priceExtractionMethod={identifiedItem.priceExtractionMethod}
                  scanReceivedAtMs={identifiedItem.scanReceivedAtMs}
                  identificationFromCache={identifiedItem.identificationFromCache ?? false}
                  insufficientSoldData={identifiedItem.insufficientSoldData ?? false}
                  pipelineSystemWarning={identifiedItem.pipelineSystemWarning ?? null}
                  ebaySoldCompCount={identifiedItem.ebaySoldCompCount ?? 0}
                  comparables={comparables}
                  comparablesAveragePrice={
                    identifiedItem.comparablesAveragePrice ?? comparables?.average_price ?? null
                  }
                  comparablesOverallConfidence={
                    identifiedItem.comparablesOverallConfidence ??
                    comparables?.overall_confidence ??
                    null
                  }
                  comparablesUnavailableReason={comparablesUnavailableReason}
                  removedComparableIds={removedComparableIds}
                  onRemoveComparable={handleRemoveComparable}
                  onOpenMarkBought={() => setBoughtDialogOpen(true)}
                  onOpenMarkSold={() => setSoldDialogOpen(true)}
                  pricesLoading={pricesLoading}
                  forensicAuth={identifiedItem.forensicAuth}
                  forensicAuthScore={identifiedItem.forensicAuthScore}
                  forensicAuthLoading={identifiedItem.forensicAuthLoading}
                  onSave={() => handleSaveItem(identifiedItem)}
                  sizeLabel={identifiedItem.sizeLabel}
                  shareUrl={
                    identifiedItem.shareToken && typeof window !== 'undefined'
                      ? `${window.location.origin}/share/scan/${identifiedItem.shareToken}`
                      : null
                  }
                  onShareMessage={(m, v) => showToast(m, v)}
                  onRescan={prepareNewPhotoCapture}
                />
              </div>
            )}

          </div>
        </div>
      </div>
      <MarkBoughtDialog
        open={boughtDialogOpen}
        defaultPriceGbp={defaultMarkBoughtPriceGbp}
        onClose={() => setBoughtDialogOpen(false)}
        onConfirm={handleMarkBoughtResult}
      />
      <MarkSoldDialog
        open={soldDialogOpen}
        brandName={identifiedItem?.brand}
        onClose={() => setSoldDialogOpen(false)}
        onConfirm={handleMarkSoldResult}
      />
      </>
    );
  }
  // ── END EMBEDDED LAYOUT ─────────────────────────────────────────────────────

  return (
    <>
    <div className={embedded ? 'flex flex-col' : 'min-h-screen bg-gray-50 flex flex-col'}>
      {/* Top Bar */}
      <header className={`bg-white border-b border-gray-100 px-6 py-4 flex items-center justify-between${embedded ? ' hidden' : ''}`}>
        <div className="flex items-center gap-4">
          <Link to="/" className="text-2xl font-bold text-black tracking-tight">Marginn</Link>
          <Link
            to="/dashboard"
            className="hidden sm:flex items-center gap-1.5 text-xs font-medium text-gray-600 bg-gray-100 px-3 py-1.5 rounded-full hover:bg-gray-200 transition-colors cursor-pointer whitespace-nowrap"
          >
            <i className="ri-dashboard-line" />
            Dashboard
          </Link>
        </div>
        <div className="flex items-center gap-3">
          {/* Tab switcher */}
          <div className="flex items-center bg-gray-100 rounded-full p-1 gap-1">
            {(['scan', 'results', 'saved', 'bought'] as const).map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`px-4 py-1.5 rounded-full text-sm font-medium transition-all whitespace-nowrap cursor-pointer capitalize ${
                  activeTab === tab ? 'bg-white text-black shadow-sm' : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                {tab === 'saved'
                  ? `Saved (${boughtItems.filter((i) => i.status === 'BOUGHT').length})`
                  : tab === 'bought'
                  ? 'History'
                  : tab.charAt(0).toUpperCase() + tab.slice(1)}
              </button>
            ))}
          </div>

          {/* Scan counter */}
          {showScanCount && (
            <Link
              to="/pricing"
              className="hidden sm:flex items-center gap-1.5 text-xs font-medium text-[#1a3d2b] bg-[#1a3d2b]/8 px-3 py-1.5 rounded-full hover:bg-[#1a3d2b]/15 transition-colors cursor-pointer whitespace-nowrap"
            >
              <i className="ri-scan-2-line" />
              {profile!.scans_limit} scans
            </Link>
          )}

          {/* User avatar dropdown */}
          {user && (
            <div className="relative" ref={userDropdownRef}>
              <button
                onClick={() => setUserDropdown(!userDropdown)}
                className="w-9 h-9 rounded-full bg-[#1a3d2b] text-white flex items-center justify-center text-sm font-bold hover:bg-[#2d5a40] transition-colors cursor-pointer"
              >
                {user.email?.[0]?.toUpperCase() ?? '?'}
              </button>
              {userDropdown && (
                <div className="absolute right-0 top-11 bg-white border border-gray-100 rounded-xl shadow-lg py-2 min-w-[180px] z-50">
                  <div className="px-4 py-2 border-b border-gray-100 mb-1">
                    <p className="text-xs text-gray-500 truncate">{user.email}</p>
                    {profile && (
                      <p className="text-xs font-semibold text-[#1a3d2b] mt-0.5 capitalize">
                        {profile.plan} plan
                      </p>
                    )}
                  </div>
                  <Link
                    to="/history"
                    onClick={() => setUserDropdown(false)}
                    className="flex items-center gap-3 px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50 cursor-pointer"
                  >
                    <div className="w-4 h-4 flex items-center justify-center">
                      <i className="ri-history-line text-gray-400" />
                    </div>
                    Scan history
                  </Link>
                  <Link
                    to="/pricing"
                    onClick={() => setUserDropdown(false)}
                    className="flex items-center gap-3 px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50 cursor-pointer"
                  >
                    <div className="w-4 h-4 flex items-center justify-center">
                      <i className="ri-bank-card-line text-gray-400" />
                    </div>
                    Billing
                  </Link>
                  <div className="border-t border-gray-100 mt-1 pt-1">
                    <button
                      onClick={handleSignOut}
                      className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-red-600 hover:bg-red-50 cursor-pointer"
                    >
                      <div className="w-4 h-4 flex items-center justify-center">
                        <i className="ri-logout-box-r-line text-red-500" />
                      </div>
                      Sign out
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </header>

      {/* DB Connection Banner */}
      {brandsCount !== null && !embedded && (
        <div className="bg-emerald-50 border-b border-emerald-100 px-6 py-2.5 flex items-center justify-center gap-2">
          <div className="w-5 h-5 flex items-center justify-center">
            <i className="ri-database-2-line text-emerald-600 text-sm"></i>
          </div>
          <p className="text-sm text-emerald-700 font-medium">
            Database connected — <span className="font-bold">{brandsCount} brands</span> loaded
          </p>
          <div className="w-2 h-2 flex items-center justify-center">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse inline-block"></span>
          </div>
        </div>
      )}

      <main className="flex-1 flex flex-col items-center justify-start py-10 px-4">

        {/* ── SCANNING OVERLAY ── */}
        {isScanning && !identifiedItem && (
          <div className="w-full flex flex-col items-center justify-center py-8">
            <ScanProgress currentStep={scanStep} />
          </div>
        )}

        {/* ── SCAN TAB ── */}
        {activeTab === 'scan' && !isScanning && (
          <div className="w-full max-w-md">
            <div className="text-center mb-6">
              <h2 className="text-2xl font-bold text-gray-900 mb-1">Scan an Item</h2>
              <p className="text-sm text-gray-500">Add up to three angles for clearer IDs and size reads</p>
            </div>

            <div className="mb-5 rounded-2xl border-2 border-gray-900/10 bg-white px-4 py-4 shadow-sm">
              <label className="block text-sm font-bold text-gray-900 mb-2">What are you paying for this piece? (£)</label>
              <div className="relative">
                <span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-500 font-semibold text-sm">£</span>
                <input
                  type="number"
                  value={buyPrice}
                  onChange={(e) => setBuyPrice(e.target.value)}
                  placeholder="0.00"
                  min="0"
                  step="0.01"
                  className="w-full pl-9 pr-4 py-3.5 bg-gray-50 border border-gray-200 rounded-xl text-base text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-black/15 focus:border-gray-400 transition-all"
                />
              </div>
              <p className="text-xs text-gray-500 mt-2 leading-snug">
                Enter your buy price <span className="font-semibold text-gray-800">before</span> you run the scan so net profit and verdict match what you pay in-store or at the rail.
              </p>
            </div>

            {/* Mode Selector */}
            <div className="mb-5">
              <label className="block text-sm font-semibold text-gray-700 mb-3">Scan Mode</label>
              <div className="grid grid-cols-3 gap-2">
                {(Object.keys(MODE_CONFIG) as ScanMode[]).map((mode) => (
                  <button
                    key={mode}
                    onClick={() => setScanMode(mode)}
                    className={`flex flex-col items-center gap-1 px-3 py-3 rounded-xl border-2 transition-all cursor-pointer ${
                      scanMode === mode
                        ? MODE_CONFIG[mode].active
                        : 'border-gray-200 bg-white text-gray-500 hover:border-gray-300'
                    }`}
                  >
                    <span className="text-sm font-semibold">{mode}</span>
                    <span className="text-[10px] leading-tight text-center opacity-70">{MODE_CONFIG[mode].desc}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Photos */}
            {hasStaged ? (
              <div className="relative w-full aspect-square rounded-2xl border-2 border-gray-200 overflow-hidden mb-5 bg-white">
                <div className="absolute inset-0 p-3 grid grid-cols-3 gap-2">
                  {stagedPhotos.map((p) => (
                    <div key={p.id} className="relative rounded-xl overflow-hidden border border-gray-100 min-h-0">
                      <img src={p.preview} alt="" className="w-full h-full object-cover" />
                      <button
                        type="button"
                        onClick={() => removeStagedPhoto(p.id)}
                        className="absolute top-2 right-2 w-8 h-8 flex items-center justify-center bg-white/90 rounded-full shadow-md hover:bg-white cursor-pointer"
                        aria-label="Remove photo"
                      >
                        <i className="ri-close-line text-gray-800" />
                      </button>
                    </div>
                  ))}
                  {stagedPhotos.length < MAX_STAGED_PHOTOS && (
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      className="rounded-xl border-2 border-dashed border-gray-300 flex flex-col items-center justify-center gap-1 text-gray-500 hover:border-black hover:text-black cursor-pointer min-h-0"
                    >
                      <i className="ri-add-line text-2xl" />
                      <span className="text-xs font-semibold">Add angle</span>
                    </button>
                  )}
                </div>
              </div>
            ) : (
              <div
                onDrop={handleDrop}
                onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
                onDragLeave={() => setDragOver(false)}
                className={`relative w-full rounded-2xl border-2 border-dashed transition-all overflow-hidden mb-5 p-8 ${
                  dragOver ? 'border-black bg-gray-100' : 'border-gray-300 bg-white'
                }`}
              >
                <div className="flex flex-col items-center gap-4 text-center">
                  <div className="w-16 h-16 flex items-center justify-center rounded-2xl bg-gray-100">
                    <i className="ri-camera-line text-3xl text-gray-400"></i>
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-gray-700 mb-1">Add 1–3 photos</p>
                    <p className="text-xs text-gray-400">or drag and drop here</p>
                  </div>
                  <div className="w-full space-y-3 mt-2">
                    <button
                      type="button"
                      onClick={() => cameraInputRef.current?.click()}
                      className="w-full flex items-center justify-center gap-2 bg-black text-white py-3.5 rounded-xl text-sm font-semibold hover:bg-gray-900 transition-all cursor-pointer whitespace-nowrap"
                    >
                      <i className="ri-camera-line text-lg"></i>
                      Take photo with camera
                    </button>
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      className="w-full flex items-center justify-center gap-2 bg-white border-2 border-gray-200 text-gray-700 py-3.5 rounded-xl text-sm font-semibold hover:border-gray-300 hover:bg-gray-50 transition-all cursor-pointer whitespace-nowrap"
                    >
                      <i className="ri-image-line text-lg"></i>
                      Upload from camera roll
                    </button>
                  </div>
                  <p className="text-xs text-gray-400 mt-2">JPG, PNG, WEBP · Max 10MB each</p>
                </div>
                {showUploadTip && (
                  <div className="absolute bottom-3 left-3 right-3 z-10 rounded-xl border border-black/10 bg-white shadow-lg p-3 flex gap-2 items-start text-left">
                    <div className="flex-1 min-w-0">
                      <p className="text-[11px] font-bold text-gray-900 uppercase tracking-wide">Tip</p>
                      <p className="text-[11px] text-gray-600 mt-1 leading-snug">
                        Use camera or upload — a clear label shot gives the best comps.
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={dismissUploadTip}
                      className="flex-shrink-0 w-7 h-7 flex items-center justify-center rounded-lg text-gray-500 hover:bg-gray-100 cursor-pointer"
                      aria-label="Dismiss tip"
                    >
                      <i className="ri-close-line text-lg" />
                    </button>
                  </div>
                )}
              </div>
            )}

            <input
              ref={cameraInputRef}
              type="file"
              accept="image/*"
              capture="environment"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) addStagedFiles([f]);
                e.target.value = '';
              }}
            />
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              multiple
              className="hidden"
              onChange={(e) => {
                if (e.target.files?.length) addStagedFiles(e.target.files);
                e.target.value = '';
              }}
            />

            {error && (
              <div className="mb-4 flex items-center gap-2 bg-red-50 border border-red-200 rounded-xl px-4 py-3">
                <i className="ri-error-warning-line text-red-500"></i>
                <p className="text-sm text-red-700">{error}</p>
              </div>
            )}

            <button
              onClick={handleScan}
              disabled={!hasStaged || isScanning}
              className="w-full bg-black text-white py-4 rounded-2xl text-base font-semibold hover:bg-gray-900 active:scale-[0.98] transition-all disabled:opacity-40 disabled:cursor-not-allowed whitespace-nowrap cursor-pointer flex items-center justify-center gap-2 shadow-lg shadow-black/10"
            >
              <i className="ri-scan-2-line text-lg"></i>
              Scan Item
            </button>

            <p className="text-center text-xs text-gray-400 mt-4">
              Checks Vinted, eBay, Depop &amp; more in seconds
            </p>
          </div>
        )}

        {/* ── RESULTS TAB ── */}
        {activeTab === 'results' && (!isScanning || identifiedItem) && (
          <div className="w-full flex flex-col items-center gap-6">
            {identifiedItem ? (
              <>
                <div className="w-full max-w-md bg-white rounded-2xl border border-gray-100 shadow-sm px-5 py-4 space-y-4">
                  <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Adjust &amp; Recalculate</p>
                  <div className="flex items-center gap-3">
                    <label className="text-sm font-medium text-gray-700 whitespace-nowrap w-20">Buy Price</label>
                    <div className="relative flex-1">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 text-sm">£</span>
                      <input
                        type="number"
                        value={buyPrice}
                        onChange={(e) => setBuyPrice(e.target.value)}
                        placeholder="0.00"
                        min="0"
                        step="0.01"
                        className="w-full pl-7 pr-3 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-black/10 focus:border-gray-400 transition-all"
                      />
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <label className="text-sm font-medium text-gray-700 whitespace-nowrap w-20">Mode</label>
                    <div className="flex gap-2 flex-1">
                      {(Object.keys(MODE_CONFIG) as ScanMode[]).map((mode) => (
                        <button
                          key={mode}
                          onClick={() => setScanMode(mode)}
                          className={`flex-1 py-2 rounded-xl border-2 text-xs font-semibold transition-all cursor-pointer whitespace-nowrap ${
                            scanMode === mode ? MODE_CONFIG[mode].active : 'border-gray-200 bg-white text-gray-500 hover:border-gray-300'
                          }`}
                        >
                          {mode}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                <ScanResultCard
                  imageUrl={identifiedItem.imageUrl}
                  brand={identifiedItem.brand}
                  productLine={identifiedItem.productLine}
                  condition={identifiedItem.condition}
                  verdict={identifiedItem.verdict ?? 'BUY'}
                  resaleValue={identifiedItem.resaleValue ?? 0}
                  netProfit={identifiedItem.netProfit ?? 0}
                  maxBuyPrice={identifiedItem.maxBuyPrice ?? 0}
                  platforms={identifiedItem.platforms}
                  flags={identifiedItem.flags ?? []}
                  explainFlags={identifiedItem.explainFlags ?? []}
                  gptVerified={identifiedItem.gptVerified ?? false}
                  ebayCount={identifiedItem.ebayCount ?? 0}
                  ebayListings={ebayListings}
                  searchTerm={identifiedItem.searchTerm}
                  purchaseCost={identifiedItem.purchaseCost}
                  platformFeeGbp={identifiedItem.platformFeeGbp}
                  platformFeeRate={identifiedItem.platformFeeRate}
                  shippingGbp={identifiedItem.shippingGbp}
                  marginBufferGbp={identifiedItem.marginBufferGbp}
                  fingerprint={identifiedItem.fingerprint}
                  conditionGrade={identifiedItem.conditionGrade}
                  authenticationFlags={identifiedItem.authenticationFlags}
                  ebayPriceTrendPct={identifiedItem.ebayPriceTrendPct}
                  flipScore={identifiedItem.flipScore}
                  flipScoreBreakdown={identifiedItem.flipScoreBreakdown}
                  soldVelocity={identifiedItem.soldVelocity}
                  scanId={identifiedItem.scanId ?? null}
                  onWatchPrice={handleWatchPriceResult}
                  watchPriceBusy={watchPriceBusy}
                  onWatchlist={watchlistActive}
                  watchUntilLabel={watchUntilLabel}
                  brandHistoryLine={brandHistoryLine}
                  boughtAt={outcomeRow?.bought_at ?? null}
                  soldAt={outcomeRow?.sold_at ?? null}
                  usedFallbackResale={identifiedItem.usedFallbackResale ?? false}
                  scrapedAtIso={identifiedItem.scrapedAt ?? null}
                  priceExtractionMethod={identifiedItem.priceExtractionMethod}
                  scanReceivedAtMs={identifiedItem.scanReceivedAtMs}
                  identificationFromCache={identifiedItem.identificationFromCache ?? false}
                  insufficientSoldData={identifiedItem.insufficientSoldData ?? false}
                  pipelineSystemWarning={identifiedItem.pipelineSystemWarning ?? null}
                  ebaySoldCompCount={identifiedItem.ebaySoldCompCount ?? 0}
                  comparables={comparables}
                  comparablesAveragePrice={
                    identifiedItem.comparablesAveragePrice ?? comparables?.average_price ?? null
                  }
                  comparablesOverallConfidence={
                    identifiedItem.comparablesOverallConfidence ??
                    comparables?.overall_confidence ??
                    null
                  }
                  comparablesUnavailableReason={comparablesUnavailableReason}
                  removedComparableIds={removedComparableIds}
                  onRemoveComparable={handleRemoveComparable}
                  onOpenMarkBought={() => setBoughtDialogOpen(true)}
                  onOpenMarkSold={() => setSoldDialogOpen(true)}
                  pricesLoading={pricesLoading}
                  forensicAuth={identifiedItem.forensicAuth}
                  forensicAuthScore={identifiedItem.forensicAuthScore}
                  forensicAuthLoading={identifiedItem.forensicAuthLoading}
                  onSave={() => handleSaveItem(identifiedItem)}
                  sizeLabel={identifiedItem.sizeLabel}
                  shareUrl={
                    identifiedItem.shareToken && typeof window !== 'undefined'
                      ? `${window.location.origin}/share/scan/${identifiedItem.shareToken}`
                      : null
                  }
                  onShareMessage={(m, v) => showToast(m, v)}
                  onRescan={() => {
                    prepareNewPhotoCapture();
                  }}
                />
              </>
            ) : (
              <div className="flex flex-col items-center justify-center py-24 text-center">
                <div className="w-20 h-20 flex items-center justify-center bg-gray-100 rounded-2xl mb-4">
                  <i className="ri-image-line text-4xl text-gray-300"></i>
                </div>
                <p className="text-gray-500 font-medium mb-1">No results yet</p>
                <p className="text-sm text-gray-400">Scan an item first to see results here</p>
                <button
                  onClick={() => setActiveTab('scan')}
                  className="mt-5 px-5 py-2.5 bg-black text-white text-sm font-medium rounded-xl hover:bg-gray-900 transition-all cursor-pointer whitespace-nowrap"
                >
                  Go to Scan
                </button>
              </div>
            )}
          </div>
        )}

        {/* ── SAVED TAB ── */}
        {activeTab === 'saved' && !isScanning && (
          <div className="w-full max-w-5xl">
            <BoughtItems items={boughtItems} onMarkAsSold={handleMarkAsSold} />
          </div>
        )}

        {/* ── BOUGHT (History) TAB ── */}
        {activeTab === 'bought' && !isScanning && (
          <div className="w-full max-w-4xl">
            <SavedItems items={savedItems} onRemoveItem={handleRemoveItem} />
          </div>
        )}
      </main>
    </div>
    <MarkBoughtDialog
      open={boughtDialogOpen}
      defaultPriceGbp={defaultMarkBoughtPriceGbp}
      onClose={() => setBoughtDialogOpen(false)}
      onConfirm={handleMarkBoughtResult}
    />
    <MarkSoldDialog
      open={soldDialogOpen}
      brandName={identifiedItem?.brand}
      onClose={() => setSoldDialogOpen(false)}
      onConfirm={handleMarkSoldResult}
    />
    </>
  );
}
