import {
  CONDITION_MULTIPLIER,
  isResaleDisplaySuppressed,
  MARGIN_BUFFER_GBP,
  MIN_EBAY_SOLD_COMPS_FOR_DISPLAY,
  PLATFORM_FEE_RATE,
  SHIPPING_GBP,
} from './scanEconomics';
import {
  ScanPipelineError,
  type PipelineReport,
} from './pipelineDiagnostics';

/** Root payload from `analyse-item` (JSON body or NDJSON `complete.data`). */
export interface AnalyseItemCompletePayload {
  fingerprint?: string;
  scanId?: string;
  scan_id?: string;
  /** Edge-reported outcome of inserting into `public.scans` (debug + client fallback). */
  scanPersist?: {
    ok: boolean;
    skipped?: boolean;
    reason?: string;
    error?: { code: string; message: string };
  };
  imageUrl?: string;
  searchQuery?: string;
  margin?: AnalyseItemMargin;
  decision?: string;
  ai?: Record<string, unknown>;
  brand?: Record<string, unknown> | null;
  livePrices?: Record<string, unknown>;
  /** When Edge has enough comps but client buckets are thin (optional). */
  ebay_price_trend_pct?: number;
  /** True when identification came from `scan_identification_cache` (vision skipped). */
  identification_from_cache?: boolean;
  /** ISO time when marketplace scrapes finished (server clock). */
  scraped_at?: string;
  /** True when resale used brand baseline instead of live eBay median. */
  used_fallback_resale?: boolean;
  /** Primary eBay price source: Finding API vs ScrapingBee vision (Vinted/Depop). */
  price_extraction_method?: "vision" | "regex_fallback" | "finding_api";
  price_extraction_methods?: {
    ebay?: "vision" | "regex_fallback" | "finding_api";
    vinted?: "vision" | "regex_fallback" | "finding_api";
    depop?: "vision" | "regex_fallback" | "finding_api";
  };
  /** True when eBay Finding API returned fewer than min sold comps. */
  ebay_low_confidence?: boolean;
  ebay_average_sold_price?: number | null;
  /** First sold comps (same shape as `listing_cache` rows) for instant thumbnails. */
  sold_comp_previews?: Array<Record<string, unknown>>;
  /** Data-backed flip score (0–10); not Claude `trend_score`. */
  flip_score?: number;
  flip_score_breakdown?: FlipScoreBreakdownPayload;
  /** Marginn M-Score 0–100 (Edge `calculateMScore`). */
  m_score?: number;
  m_score_breakdown?: Record<string, unknown>;
  authentication?: Record<string, unknown>;
  authentication_score?: number;
  authentication_verdict?: string;
  sold_velocity?: { d7: number; d30: number };
  /** Claude-only style hint (vision JSON, 0–15). */
  vision_trend_hint?: number;
  /** Flat shape (alternate clients) */
  brand_name?: string;
  /** Top-level resale (£) — mirrors `margin.resale_gbp` when present. */
  resale_price?: number | null;
  /** True when below min sold comps — do not show a resale £ figure. */
  insufficient_sold_data?: boolean;
  ebay_sold_comp_count?: number;
  min_sold_comps_required?: number;
  /** Public share UUID returned after `scans` insert (requires migration). */
  share_token?: string | null;
  /** Structured pipeline diagnosis (stages, E-/U- codes, user_message). */
  pipeline_report?: PipelineReport;
  pipeline_primary_code?: string | null;
  pipeline_issue_category?: 'none' | 'user' | 'system';
}

function medianPositive(prices: number[]): number {
  const valid = prices.filter((p) => Number.isFinite(p) && p > 0);
  if (valid.length === 0) return 0;
  const sorted = [...valid].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 !== 0
    ? sorted[mid]!
    : Math.round((sorted[mid - 1]! + sorted[mid]!) / 2);
}

function brandPlatformMidpoint(
  brand: Record<string, unknown> | null | undefined,
  minKey: string,
  maxKey: string
): number {
  if (!brand) return 0;
  const min = Number(brand[minKey] ?? 0);
  const max = Number(brand[maxKey] ?? 0);
  if (min > 0 && max > 0) return (min + max) / 2;
  if (max > 0) return max;
  if (min > 0) return min;
  return 0;
}

/**
 * Resale for UI display. Returns 0 when comps are insufficient (caller hides £).
 */
export function coalesceResaleGbp(
  data: Record<string, unknown>,
  conditionGrade = 'GOOD'
): number {
  if (isResaleDisplaySuppressed(data)) return 0;

  const margin = data.margin as AnalyseItemMargin | undefined;
  if (typeof margin?.resale_gbp === 'number' && margin.resale_gbp > 0) {
    return Math.round(margin.resale_gbp);
  }

  const flat = data.resale_price;
  if (typeof flat === 'number' && Number.isFinite(flat) && flat > 0) {
    return Math.round(flat);
  }

  const lp = data.livePrices as
    | {
        ebay?: { avg?: number; scraped?: boolean };
        vinted?: { avg?: number; scraped?: boolean };
        depop?: { avg?: number; scraped?: boolean };
      }
    | undefined;

  if (lp?.ebay?.avg && lp.ebay.avg > 0) return Math.round(lp.ebay.avg);
  if (lp?.vinted?.avg && lp.vinted.avg > 0) return Math.round(lp.vinted.avg);
  if (lp?.depop?.avg && lp.depop.avg > 0) return Math.round(lp.depop.avg);

  const previews = data.sold_comp_previews;
  if (Array.isArray(previews)) {
    const previewPrices = previews
      .map((row) => {
        const r = row as Record<string, unknown>;
        const p = r.price_gbp ?? r.price;
        return typeof p === 'number' ? p : Number(p);
      })
      .filter((p) => Number.isFinite(p) && p > 0);
    const med = medianPositive(previewPrices);
    if (med > 0) return med;
  }

  const brand = data.brand as Record<string, unknown> | null | undefined;
  const mult = CONDITION_MULTIPLIER[conditionGrade] ?? CONDITION_MULTIPLIER.GOOD ?? 0.85;
  const ebayMid = brandPlatformMidpoint(brand, 'ebay_min', 'ebay_max');
  if (ebayMid > 0) return Math.max(15, Math.round(ebayMid * mult));

  const baselineRaw = brand ? Number(brand.baseline_resale_gbp ?? 40) : 40;
  const baseline = Number.isFinite(baselineRaw) && baselineRaw > 0 ? baselineRaw : 40;
  return Math.max(15, Math.round(baseline * mult));
}

/** Rebuild margin from coalesced resale so UI never shows £0 after a successful scan. */
export function buildEffectiveMargin(
  data: Record<string, unknown>,
  conditionGrade: string,
  purchaseCost?: number
): AnalyseItemMargin {
  if (isResaleDisplaySuppressed(data)) {
    const existing = data.margin as AnalyseItemMargin | undefined;
    return {
      resale_gbp: 0,
      platform_fee_rate: existing?.platform_fee_rate ?? PLATFORM_FEE_RATE,
      platform_fee_gbp: 0,
      shipping_gbp: existing?.shipping_gbp ?? SHIPPING_GBP,
      margin_buffer_gbp: existing?.margin_buffer_gbp ?? MARGIN_BUFFER_GBP,
      buy_price_gbp:
        typeof existing?.buy_price_gbp === 'number' && existing.buy_price_gbp > 0
          ? existing.buy_price_gbp
          : purchaseCost != null && purchaseCost > 0
            ? purchaseCost
            : null,
      net_profit_gbp: null,
      max_buy_price_gbp: 0,
      roi_percent: null,
    };
  }

  const resale = coalesceResaleGbp(data, conditionGrade);
  const existing = data.margin as AnalyseItemMargin | undefined;
  const feeRate = existing?.platform_fee_rate ?? PLATFORM_FEE_RATE;
  const shipping = existing?.shipping_gbp ?? SHIPPING_GBP;
  const buffer = existing?.margin_buffer_gbp ?? MARGIN_BUFFER_GBP;
  const buyRaw =
    existing?.buy_price_gbp ??
    (purchaseCost != null && purchaseCost > 0 ? purchaseCost : null);
  const buy = typeof buyRaw === 'number' && buyRaw > 0 ? buyRaw : null;
  const platformFeeGbp = Math.round(resale * feeRate);
  const maxBuyPriceGbp = Math.max(0, Math.round(resale - platformFeeGbp - shipping - buffer));
  const netProfitGbp =
    buy != null ? Math.round(resale - buy - platformFeeGbp - shipping) : null;
  const roiPercent =
    buy != null && buy > 0 ? Math.round(((resale - buy) / buy) * 100) : null;

  return {
    resale_gbp: resale,
    platform_fee_rate: feeRate,
    platform_fee_gbp: platformFeeGbp,
    shipping_gbp: shipping,
    margin_buffer_gbp: buffer,
    buy_price_gbp: buy,
    net_profit_gbp: netProfitGbp,
    max_buy_price_gbp: maxBuyPriceGbp,
    roi_percent: roiPercent,
  };
}

/** Mirrors Edge `_shared/flipScore.ts` breakdown for UI + `scans.flip_score_breakdown`. */
export interface FlipScoreBreakdownPayload {
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
  sold_velocity: { d7: number; d30: number; method: string };
  labels: Record<string, string>;
  vision_trend_hint?: number;
}

/** Economics payload returned by `analyse-item` (JSON + NDJSON `complete` event). */
export interface AnalyseItemMargin {
  resale_gbp: number;
  platform_fee_rate: number;
  platform_fee_gbp: number;
  shipping_gbp: number;
  margin_buffer_gbp: number;
  buy_price_gbp: number | null;
  net_profit_gbp: number | null;
  max_buy_price_gbp: number;
  roi_percent: number | null;
}

/** Long edge aligned with Anthropic vision cap for non-Opus models (~1568px). */
const DEFAULT_MAX_LONG_EDGE = 1568;
const JPEG_QUALITY = 0.88;

export interface EncodedScanImage {
  base64: string;
  mimeType: string;
}

/**
 * Downscale and re-encode as JPEG for faster uploads to the Edge Function
 * while keeping tags/logos readable.
 */
export async function encodeImageForScan(
  file: File,
  maxLongEdge: number = DEFAULT_MAX_LONG_EDGE
): Promise<EncodedScanImage> {
  try {
    const bitmap = await createImageBitmap(file);
    const w = bitmap.width;
    const h = bitmap.height;
    const scale = Math.min(1, maxLongEdge / Math.max(w, h));
    const tw = Math.max(1, Math.round(w * scale));
    const th = Math.max(1, Math.round(h * scale));
    const canvas = document.createElement("canvas");
    canvas.width = tw;
    canvas.height = th;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("no canvas context");
    ctx.drawImage(bitmap, 0, 0, tw, th);
    bitmap.close();
    const dataUrl = canvas.toDataURL("image/jpeg", JPEG_QUALITY);
    const comma = dataUrl.indexOf(",");
    const base64 = comma >= 0 ? dataUrl.slice(comma + 1) : dataUrl;
    return { base64, mimeType: "image/jpeg" };
  } catch {
    const buf = await file.arrayBuffer();
    let binary = "";
    const bytes = new Uint8Array(buf);
    const chunk = 0x8000;
    for (let i = 0; i < bytes.length; i += chunk) {
      binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
    }
    const base64 = btoa(binary);
    const mimeType = file.type && file.type.startsWith("image/") ? file.type : "image/jpeg";
    return { base64, mimeType };
  }
}

/** Optional callbacks while reading an NDJSON scan stream. */
export type ReadNdjsonScanResponseCallbacks = {
  /** Fired when an `analysis` event line is parsed (no payload). */
  onAnalysis?: () => void;
  /** Fired with `data` from an `analysis` event for staged UI. */
  onAnalysisData?: (data: Record<string, unknown>) => void;
};

function normalizeNdjsonCallbacks(
  callbacks?: ReadNdjsonScanResponseCallbacks | (() => void)
): ReadNdjsonScanResponseCallbacks {
  if (typeof callbacks === "function") return { onAnalysis: callbacks };
  return callbacks ?? {};
}

function handleNdjsonEventLine(
  obj: {
    event?: string;
    data?: Record<string, unknown>;
    message?: string;
    error_code?: string;
    pipeline_report?: PipelineReport;
  },
  cbs: ReadNdjsonScanResponseCallbacks,
  onComplete: (data: Record<string, unknown>) => void
): void {
  if (obj.event === "analysis") {
    cbs.onAnalysis?.();
    if (obj.data && typeof obj.data === "object") cbs.onAnalysisData?.(obj.data);
  }
  if (obj.event === "error") {
    const payload: Record<string, unknown> = {
      error: obj.message ?? "Scan stream failed",
      message: obj.message,
      error_code: obj.error_code,
      pipeline_report: obj.pipeline_report,
    };
    throw new ScanPipelineError(
      (obj.pipeline_report?.user_message ?? obj.message ?? "Scan stream failed").trim(),
      {
        errorCode: obj.error_code ?? obj.pipeline_report?.primary_code ?? null,
        issueCategory: obj.pipeline_report?.issue_category ?? "system",
        pipelineReport: obj.pipeline_report ?? null,
      }
    );
  }
  if (obj.event === "complete" && obj.data) onComplete(obj.data);
}

/**
 * Read NDJSON lines from analyse-item when `stream: true` was sent.
 * Invokes `onAnalysis` / `onAnalysisData` on each `analysis` event; returns `complete.data`.
 * Second argument may be a legacy `() => void` (treated as `onAnalysis`) for backward compatibility.
 */
export async function readNdjsonScanResponse(
  res: Response,
  callbacks?: ReadNdjsonScanResponseCallbacks | (() => void)
): Promise<Record<string, unknown>> {
  if (!res.body) throw new Error("No response body");
  const cbs = normalizeNdjsonCallbacks(callbacks);
  const reader = res.body.getReader();
  const dec = new TextDecoder();
  let buf = "";
  let complete: Record<string, unknown> | null = null;
  const onComplete = (data: Record<string, unknown>) => {
    complete = data;
  };
  for (;;) {
    const { done, value } = await reader.read();
    buf += dec.decode(value ?? new Uint8Array(), { stream: !done });
    const lines = buf.split("\n");
    buf = lines.pop() ?? "";
    for (const line of lines) {
      if (!line.trim()) continue;
      const obj = JSON.parse(line) as {
        event?: string;
        data?: Record<string, unknown>;
        message?: string;
      };
      handleNdjsonEventLine(obj, cbs, onComplete);
    }
    if (done) break;
  }
  // Flush a final line that arrived without a trailing newline in the last chunk
  const tail = buf.trim();
  if (tail) {
    const obj = JSON.parse(tail) as {
      event?: string;
      data?: Record<string, unknown>;
      message?: string;
    };
    handleNdjsonEventLine(obj, cbs, onComplete);
  }
  if (!complete) throw new Error("Scan stream missing complete payload");
  return complete;
}
