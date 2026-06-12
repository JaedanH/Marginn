import { useEffect, useMemo, useState } from 'react';
import FlipScoreMeter from './FlipScoreMeter';
import ForensicAuthBanner from './ForensicAuthBanner';
import type { ForensicAuthentication } from '../../../lib/forensicAuthentication';
import type { FlipScoreBreakdownPayload } from '../../../lib/scanEdgeResponse';
import {
  CO2_TEXTILE_WASTE_KG,
  PLATFORM_FEE_RATE,
  SHIPPING_GBP,
  conditionUpgradeDeltaGbp,
  pickBestResalePlatformLine,
} from '../../../lib/scanEconomics';
import { sizeSensitivityLabel } from '../../../lib/brandSizeSensitivity';
import { ebayPriceTrendFromListings, timeToSellBandDays } from '../../../lib/scanListingInsights';
import {
  type ComparableListing,
  type ComparablesPayload,
} from '../../../lib/findBestComparables';
import ComparablesSection from './ComparablesSection';

export interface ListingCacheRow {
  id: string;
  scan_id: string;
  platform: string;
  title: string | null;
  price_gbp: number | null;
  image_url: string | null;
  listing_url: string | null;
  days_ago: number | null;
}

interface Platform {
  name: string;
  avgPrice: number;
  listings: number;
  soldListings: number;
  url: string;
  /** Live median from scrape (when false, median is a fallback estimate) */
  scraped?: boolean;
}

interface ScanResultCardProps {
  imageUrl: string;
  brand: string;
  productLine?: string;
  condition: string;
  verdict: 'BUY' | 'MAYBE' | 'SKIP';
  resaleValue: number;
  netProfit: number;
  maxBuyPrice: number;
  platforms: Platform[];
  flags: string[];
  explainFlags?: string[];
  gptVerified?: boolean;
  ebayCount?: number;
  ebayListings?: ListingCacheRow[];
  searchTerm?: string;
  /** What you paid / list price — used in fee breakdown */
  purchaseCost?: number;
  /** ~12% platform fee on expected resale */
  platformFeeGbp?: number;
  /** e.g. 0.12 from edge */
  platformFeeRate?: number;
  /** Assumed shipping (£) in net profit */
  shippingGbp?: number;
  /** £ buffer in max buy (from edge) */
  marginBufferGbp?: number;
  /** Short deterministic scan id (Edge `fingerprint` or client fallback). */
  fingerprint?: string;
  conditionGrade?: string;
  authenticationFlags?: string[];
  ebayPriceTrendPct?: number | null;
  /** Persisted scan row id — enables watchlist / outcomes when set. */
  scanId?: string | null;
  onWatchPrice?: () => void | Promise<void>;
  watchPriceBusy?: boolean;
  onWatchlist?: boolean;
  /** e.g. "14 May 2026, 15:30" from parent */
  watchUntilLabel?: string | null;
  brandHistoryLine?: string | null;
  resaleWatchHint?: string;
  boughtAt?: string | null;
  soldAt?: string | null;
  onOpenMarkBought?: () => void;
  onOpenMarkSold?: () => void;
  flipScore?: number | null;
  flipScoreBreakdown?: FlipScoreBreakdownPayload | null;
  soldVelocity?: { d7: number; d30: number } | null;
  /** Garment size read from tags in vision (`size_label`). */
  sizeLabel?: string;
  /** Full URL for public share (`/share/scan/:token`). */
  shareUrl?: string | null;
  onShareMessage?: (message: string, variant: 'success' | 'error') => void;
  usedFallbackResale?: boolean;
  scrapedAtIso?: string | null;
  priceExtractionMethod?: 'vision' | 'regex_fallback' | 'finding_api';
  scanReceivedAtMs?: number;
  identificationFromCache?: boolean;
  /** Fewer than 10 live eBay sold comps — hide resale £ and show manual browse CTA. */
  insufficientSoldData?: boolean;
  ebaySoldCompCount?: number;
  /** Marginn system partial failure (E-*), when scan still returned a result. */
  pipelineSystemWarning?: string | null;
  /** Live medians / margin still loading from NDJSON `complete` after `analysis`. */
  pricesLoading?: boolean;
  comparables?: ComparablesPayload | null;
  comparablesAveragePrice?: number | null;
  comparablesOverallConfidence?: number | null;
  comparablesUnavailableReason?: string | null;
  removedComparableIds?: Set<string>;
  onRemoveComparable?: (listing: ComparableListing) => void;
  forensicAuth?: ForensicAuthentication | null;
  forensicAuthScore?: number | null;
  forensicAuthLoading?: boolean;
  onSave: () => void;
  onRescan: () => void;
}

function relativeTimeFromMs(anchorMs: number, nowMs: number): string {
  const sec = Math.max(0, Math.round((nowMs - anchorMs) / 1000));
  if (sec < 45) return 'just now';
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min} min ago`;
  const hr = Math.floor(min / 60);
  if (hr < 48) return `${hr} h ago`;
  const d = Math.floor(hr / 24);
  return `${d} d ago`;
}

const COPY_LIMITED_DATA = 'Limited data — treat with caution';
const COPY_MANUAL_BROWSE = 'Limited data — browse manually';
const COPY_FALLBACK = 'Estimated price — no live sold listings found';

const VERDICT_CONFIG = {
  BUY: { bg: 'bg-emerald-500', text: 'text-white', label: 'BUY', ring: 'ring-emerald-200' },
  MAYBE: { bg: 'bg-amber-400', text: 'text-white', label: 'MAYBE', ring: 'ring-amber-200' },
  SKIP: { bg: 'bg-rose-500', text: 'text-white', label: 'SKIP', ring: 'ring-rose-200' },
};

const FLAG_CONFIG: Record<string, { icon: string; color: string; bg: string; desc: string }> = {
  'LOW CONFIDENCE': { icon: 'ri-question-line', color: 'text-amber-700', bg: 'bg-amber-50 border-amber-200', desc: 'Limited listing data found. Result may be less accurate.' },
  'CONDITION PENALTY': { icon: 'ri-alert-line', color: 'text-rose-700', bg: 'bg-rose-50 border-rose-200', desc: 'Item condition reduces expected resale value.' },
  'HIGH COMPETITION': { icon: 'ri-group-line', color: 'text-orange-700', bg: 'bg-orange-50 border-orange-200', desc: 'Many similar listings active — may take longer to sell.' },
  'PRICE VOLATILE': { icon: 'ri-line-chart-line', color: 'text-brand-700', bg: 'bg-brand-50 border-brand-200', desc: 'Prices fluctuate significantly. Timing your sale matters.' },
};

// ── eBay listing card ─────────────────────────────────────────────────────────

function EbayListingCard({ listing, featured = false }: { listing: ListingCacheRow; featured?: boolean }) {
  const price = listing.price_gbp ?? 0;
  const wrap = featured ? 'w-full min-w-0' : 'flex-shrink-0 w-28';
  const imgH = featured ? 'h-24' : 'h-20';
  const content = (
    <div className={`${wrap} bg-white border border-gray-100 rounded-xl overflow-hidden hover:border-gray-200 transition-all`}>
      {listing.image_url ? (
        <img
          src={listing.image_url}
          alt={listing.title ?? ''}
          className={`w-full ${imgH} object-cover object-top`}
          onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
        />
      ) : (
        <div className={`w-full ${imgH} bg-gray-100 flex items-center justify-center`}>
          <i className="ri-image-line text-gray-300 text-xl"></i>
        </div>
      )}
      <div className="p-2">
        <p className="text-xs font-black text-gray-900 mb-0.5">£{price}</p>
        <p className="text-[10px] text-gray-600 leading-tight line-clamp-2 mb-1.5">{listing.title}</p>
        <div className="flex items-center justify-between gap-1">
          <span className="text-[9px] bg-emerald-100 text-emerald-700 font-bold px-1.5 py-0.5 rounded-full whitespace-nowrap">SOLD</span>
          {listing.days_ago !== null && (
            <span className="text-[9px] text-gray-400 whitespace-nowrap">{listing.days_ago}d ago</span>
          )}
        </div>
      </div>
    </div>
  );

  if (listing.listing_url) {
    return (
      <a href={listing.listing_url} target="_blank" rel="noopener noreferrer" className="cursor-pointer">
        {content}
      </a>
    );
  }
  return content;
}

// ── Platform price pill ───────────────────────────────────────────────────────

function PlatformAvgPill({ name, avgPrice, colorClass }: { name: string; avgPrice: number; colorClass: string }) {
  return (
    <div className={`inline-flex items-center gap-2 rounded-xl border px-3 py-2 ${colorClass}`}>
      <span className="text-[11px] font-semibold">{name} avg</span>
      <span className="text-sm font-black">
        {avgPrice > 0 ? `£${avgPrice}` : <span className="text-xs font-medium opacity-60">N/A</span>}
      </span>
    </div>
  );
}

export default function ScanResultCard({
  imageUrl,
  brand,
  productLine,
  condition,
  verdict,
  resaleValue,
  netProfit,
  maxBuyPrice,
  platforms,
  flags,
  explainFlags = [],
  gptVerified = false,
  ebayCount: _ebayCount = 0,
  ebayListings = [],
  searchTerm,
  purchaseCost,
  platformFeeGbp,
  platformFeeRate,
  shippingGbp,
  marginBufferGbp = 10,
  fingerprint,
  conditionGrade = 'GOOD',
  authenticationFlags = [],
  ebayPriceTrendPct = null,
  scanId,
  onWatchPrice,
  watchPriceBusy = false,
  onWatchlist = false,
  watchUntilLabel,
  brandHistoryLine,
  resaleWatchHint = "We'll compare the latest resale estimate on your next dashboard visit or scan.",
  boughtAt,
  soldAt,
  onOpenMarkBought,
  onOpenMarkSold,
  flipScore,
  flipScoreBreakdown,
  soldVelocity,
  sizeLabel,
  shareUrl,
  onShareMessage,
  pricesLoading = false,
  forensicAuth = null,
  forensicAuthScore = null,
  forensicAuthLoading = false,
  usedFallbackResale = false,
  scrapedAtIso = null,
  priceExtractionMethod,
  scanReceivedAtMs,
  identificationFromCache = false,
  insufficientSoldData = false,
  ebaySoldCompCount = 0,
  pipelineSystemWarning = null,
  comparables = null,
  comparablesAveragePrice = null,
  comparablesOverallConfidence = null,
  comparablesUnavailableReason = null,
  removedComparableIds,
  onRemoveComparable,
  onSave,
  onRescan,
}: ScanResultCardProps) {
  const [nowTick, setNowTick] = useState(() => Date.now());
  const [saved, setSaved] = useState(false);
  const [shareBusy, setShareBusy] = useState(false);
  const [revealStage, setRevealStage] = useState(1);

  useEffect(() => {
    const id = window.setInterval(() => setNowTick(Date.now()), 30_000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    setRevealStage(1);
    const t2 = window.setTimeout(() => setRevealStage(2), 500);
    const t3 = window.setTimeout(() => setRevealStage(3), 1000);
    const t4 = window.setTimeout(() => setRevealStage(4), 1500);
    const t5 = window.setTimeout(() => setRevealStage(5), 2000);
    return () => {
      window.clearTimeout(t2);
      window.clearTimeout(t3);
      window.clearTimeout(t4);
      window.clearTimeout(t5);
    };
  }, [scanId, fingerprint, brand, imageUrl]);

  const stageFade = (stage: number) =>
    `transition-opacity duration-500 ease-out ${revealStage >= stage ? 'opacity-100' : 'opacity-0'}`;

  const vc = VERDICT_CONFIG[verdict];

  const handleSave = () => {
    onSave();
    setSaved(true);
    setTimeout(() => setSaved(false), 2500);
  };

  const handleShare = async () => {
    if (!shareUrl?.trim()) {
      onShareMessage?.('Share link is not ready yet.', 'error');
      return;
    }
    const url = shareUrl.trim();
    setShareBusy(true);
    try {
      if (typeof navigator !== 'undefined' && navigator.share) {
        await navigator.share({ title: 'Marginn scan', text: 'Scan result', url });
        onShareMessage?.('Shared', 'success');
      } else if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(url);
        onShareMessage?.('Link copied to clipboard', 'success');
      } else {
        onShareMessage?.('Copy not supported in this browser', 'error');
      }
    } catch (e) {
      const name = e instanceof Error ? e.name : '';
      if (name === 'AbortError') return;
      try {
        if (navigator.clipboard?.writeText) {
          await navigator.clipboard.writeText(url);
          onShareMessage?.('Link copied to clipboard', 'success');
        } else {
          onShareMessage?.('Could not share or copy link', 'error');
        }
      } catch {
        onShareMessage?.('Could not share or copy link', 'error');
      }
    } finally {
      setShareBusy(false);
    }
  };

  const ebayPlatform = platforms.find((p) => p.name === 'eBay');
  const vintedPlatform = platforms.find((p) => p.name === 'Vinted');
  const depopPlatform = platforms.find((p) => p.name === 'Depop');

  const ebayScrapedLive = ebayPlatform?.scraped ?? false;
  const ebaySampleListings = ebayPlatform?.listings ?? 0;
  const recvMs = scanReceivedAtMs ?? nowTick;
  const dataFreshnessLine = useMemo(() => {
    const now = nowTick;
    if (scrapedAtIso) {
      const t = Date.parse(scrapedAtIso);
      if (Number.isFinite(t)) {
        return `Live sold data scraped ${relativeTimeFromMs(t, now)} (server time). Market can still move after that moment.`;
      }
    }
    return `Live at scan time — ${relativeTimeFromMs(recvMs, now)} on this device when the result arrived. Treat as a snapshot, not a live quote.`;
  }, [scrapedAtIso, recvMs, nowTick]);

  const soldCompCountForTrust =
    ebaySoldCompCount > 0 ? ebaySoldCompCount : ebaySampleListings;
  const showManualBrowse =
    !pricesLoading &&
    (insufficientSoldData || soldCompCountForTrust < 10);
  const showPriceFallback =
    !showManualBrowse && (usedFallbackResale || !ebayScrapedLive);

  const feePct =
    platformFeeRate != null && platformFeeRate > 0
      ? Math.round(platformFeeRate * 100)
      : 12;

  // Build an effective search term — prefer the enriched term from the edge function,
  // fall back to brand + productLine so links always include a query
  const effectiveSearchTerm = (searchTerm && searchTerm.trim())
    || [brand, productLine].filter(Boolean).join(' ').trim()
    || brand;

  const ebayDeepLink = `https://www.ebay.co.uk/sch/i.html?_nkw=${encodeURIComponent(effectiveSearchTerm)}&LH_Sold=1&LH_Complete=1&LH_SoldDateFilter=3`;
  const vintedDeepLink = `https://www.vinted.co.uk/catalog?search_text=${encodeURIComponent(effectiveSearchTerm)}&order=relevance`;
  const depopDeepLink = `https://www.depop.com/search/?country=gb&q=${encodeURIComponent(effectiveSearchTerm)}`;

  const similarTop = useMemo(() => ebayListings.slice(0, 3), [ebayListings]);
  const moreComps = useMemo(() => ebayListings.slice(3), [ebayListings]);

  const priceTrend = useMemo(
    () => ebayPriceTrendFromListings(ebayListings, ebayPriceTrendPct),
    [ebayListings, ebayPriceTrendPct]
  );

  const sellBand = useMemo(
    () => timeToSellBandDays(ebayListings.map((l) => l.days_ago)),
    [ebayListings]
  );

  const sizeLine = useMemo(() => sizeSensitivityLabel(brand), [brand]);

  const conditionDelta = useMemo(
    () => conditionUpgradeDeltaGbp({ resaleValueGbp: resaleValue, conditionGrade }),
    [resaleValue, conditionGrade]
  );

  const bestPlatformLine = useMemo(
    () =>
      pickBestResalePlatformLine({
        platforms,
        feeRate: platformFeeRate ?? PLATFORM_FEE_RATE,
        shippingGbp: shippingGbp ?? SHIPPING_GBP,
      }),
    [platforms, platformFeeRate, shippingGbp]
  );

  return (
    <div className="w-full max-w-md mx-auto">
      <div className="bg-white rounded-3xl overflow-hidden shadow-xl shadow-black/8 border border-gray-100">
        {/* Photo — full width at top */}
        <div className="relative w-full h-64 bg-gray-100">
          <img src={imageUrl} alt={brand} className="w-full h-full object-cover object-top" />
          {pricesLoading ? (
            <div
              className="absolute top-4 right-4 h-9 w-24 rounded-full bg-gray-200/90 animate-pulse shadow-md ring-4 ring-gray-100"
              aria-hidden
            />
          ) : (
            <div className={`absolute top-4 right-4 ${vc.bg} ${vc.text} px-5 py-2 rounded-full text-sm font-black tracking-widest shadow-lg ring-4 ${vc.ring}`}>
              {vc.label}
            </div>
          )}
          <div className="absolute top-4 left-4 flex items-center gap-2">
            <button
              type="button"
              onClick={handleSave}
              className="w-9 h-9 flex items-center justify-center bg-white/90 backdrop-blur-sm rounded-full shadow-md hover:bg-white transition-all cursor-pointer"
              aria-label={saved ? 'Saved' : 'Save item'}
            >
              <i className={`${saved ? 'ri-bookmark-fill text-black' : 'ri-bookmark-line text-gray-700'} text-base`}></i>
            </button>
            {shareUrl?.trim() ? (
              <button
                type="button"
                onClick={handleShare}
                disabled={shareBusy}
                className="w-9 h-9 flex items-center justify-center bg-white/90 backdrop-blur-sm rounded-full shadow-md hover:bg-white transition-all cursor-pointer disabled:opacity-50"
                aria-label="Share scan"
              >
                <i className={`ri-share-forward-line text-gray-700 text-base ${shareBusy ? 'animate-pulse' : ''}`}></i>
              </button>
            ) : null}
          </div>
        </div>

        {/* Stage 1 — brand, condition, verdict badge (on photo) */}
        <div className="px-5 pt-4 pb-1">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <p className="text-xl font-bold text-gray-900 leading-tight">{brand}</p>
              {gptVerified && (
                <span className="flex items-center gap-1 bg-emerald-50 border border-emerald-200 text-emerald-700 text-[10px] font-bold px-2 py-0.5 rounded-full whitespace-nowrap">
                  <i className="ri-checkbox-circle-fill text-emerald-500 text-xs"></i>
                  GPT Verified
                </span>
              )}
            </div>
            {productLine && <p className="text-sm font-medium text-gray-700 mt-0.5 leading-snug">{productLine}</p>}
            <p className="text-sm text-gray-400 mt-0.5">{condition}</p>
            {sizeLabel?.trim() ? (
              <p className="text-xs font-semibold text-gray-600 mt-1">Size on tag: {sizeLabel.trim()}</p>
            ) : null}
            {fingerprint ? (
              <p className="text-[10px] text-gray-400 mt-1 font-mono tracking-tight" title="Deterministic scan fingerprint">
                Fingerprint {fingerprint}
              </p>
            ) : null}
          </div>
        </div>

        {(authenticationFlags?.length ?? 0) > 0 ? (
          <div className="bg-rose-600 text-white px-4 py-3 flex gap-2.5 items-start border-b border-rose-700/30 mx-0">
            <i className="ri-alarm-warning-fill text-lg shrink-0 mt-0.5" aria-hidden />
            <div className="min-w-0">
              <p className="text-[10px] font-black uppercase tracking-wider opacity-95">Authenticity caution</p>
              <p className="text-xs font-semibold leading-snug mt-1 break-words">
                {authenticationFlags.join(' · ')}
              </p>
            </div>
          </div>
        ) : null}

        <ForensicAuthBanner
          loading={forensicAuthLoading}
          auth={forensicAuth}
          score={forensicAuthScore}
        />

        <div className="px-5 pt-4 pb-6 space-y-5">

          {!pricesLoading &&
            typeof flipScore === 'number' &&
            flipScoreBreakdown &&
            soldVelocity &&
            Number.isFinite(flipScore) && (
              <FlipScoreMeter
                score={flipScore}
                breakdown={flipScoreBreakdown}
                soldVelocity={soldVelocity}
                revealStage={revealStage}
              />
            )}

          {/* Market + impact copy — stage 4 */}
          {pricesLoading ? (
            <div className="rounded-2xl border border-gray-100 bg-gray-50/90 px-4 py-3 space-y-2.5 animate-pulse" aria-busy>
              <div className="h-2.5 bg-gray-200 rounded w-28" />
              <div className="h-3 bg-gray-200 rounded w-full" />
              <div className="h-3 bg-gray-200 rounded w-[92%]" />
              <div className="h-3 bg-gray-200 rounded w-[88%]" />
              <div className="h-3 bg-gray-200 rounded w-[70%]" />
            </div>
          ) : (
          <div className={`rounded-2xl border border-gray-100 bg-gray-50/90 px-4 py-3 space-y-2 ${stageFade(4)}`}>
            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Market signals</p>
            {priceTrend.status === 'trend' ? (
              <p className="text-xs text-gray-800 font-semibold leading-snug flex gap-2 items-start">
                <span className="text-emerald-600 shrink-0 text-sm" aria-hidden>
                  {priceTrend.direction === 'up' ? '↑' : '↓'}
                </span>
                <span>
                  {priceTrend.direction === 'up' ? 'Prices up' : 'Prices down'} ~{priceTrend.pct}% vs older sold
                  comps (recent vs 1–3 mo ago).
                </span>
              </p>
            ) : ebayListings.length > 0 ? (
              <p className="text-xs text-gray-500 leading-snug">Price trend: insufficient dated sold comps.</p>
            ) : null}
            <p className="text-xs text-gray-800 leading-snug flex gap-2 items-start">
              <i className="ri-store-2-line text-emerald-600 shrink-0 text-sm mt-0.5" aria-hidden />
              <span>{bestPlatformLine}</span>
            </p>
            {sellBand ? (
              <p className="text-xs text-gray-700 leading-snug flex gap-2 items-start">
                <i className="ri-timer-line text-amber-600 shrink-0 text-sm mt-0.5" aria-hidden />
                <span>
                  Typically sells in {sellBand.low}–{sellBand.high} days (from this scan&apos;s sold comps).
                </span>
              </p>
            ) : ebayListings.some((l) => l.days_ago != null) ? (
              <p className="text-xs text-gray-500 leading-snug">Time-to-sell: insufficient sold-date coverage.</p>
            ) : null}
            {sizeLine ? (
              <p className="text-xs text-gray-700 flex gap-2 items-start">
                <i className="ri-ruler-line text-gray-500 shrink-0 text-sm mt-0.5" aria-hidden />
                <span>{sizeLine}</span>
              </p>
            ) : null}
            {conditionDelta != null && conditionDelta > 0 ? (
              <p className="text-xs text-gray-800 leading-snug flex gap-2 items-start">
                <i className="ri-arrow-up-circle-line text-indigo-600 shrink-0 text-sm mt-0.5" aria-hidden />
                <span>
                  Upgrading condition one step could add ~£{conditionDelta} vs this grade (modelled with same
                  condition multipliers as the scan).
                </span>
              </p>
            ) : null}
            <p className="text-xs text-emerald-900/90 leading-snug flex gap-2 items-start pt-1 border-t border-gray-200/80">
              <i className="ri-leaf-line shrink-0 text-sm mt-0.5" aria-hidden />
              <span>Buying this item saves ~{CO2_TEXTILE_WASTE_KG} kg textile waste (same 2.1 kg model as the dashboard).</span>
            </p>
          </div>
          )}

          {pipelineSystemWarning && !pricesLoading ? (
            <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3">
              <p className="text-xs text-rose-950 leading-relaxed">{pipelineSystemWarning}</p>
            </div>
          ) : null}

          {/* Stat boxes — hidden when comps too thin (trust guard) */}
          {pricesLoading ? (
            <div className="grid grid-cols-3 gap-2.5 animate-pulse" aria-busy>
              {[0, 1, 2].map((k) => (
                <div key={k} className="bg-gray-50 rounded-2xl p-3.5 text-center border border-gray-100 space-y-2">
                  <div className="h-2.5 bg-gray-200 rounded w-14 mx-auto" />
                  <div className="h-7 bg-gray-200 rounded-lg w-20 mx-auto" />
                  {k === 2 ? <div className="h-2 bg-gray-200 rounded w-full mt-1" /> : null}
                </div>
              ))}
            </div>
          ) : showManualBrowse ? (
            <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-4 space-y-3">
              <p className="text-sm font-bold text-amber-950">{COPY_MANUAL_BROWSE}</p>
              <p className="text-xs text-amber-900/90 leading-relaxed">
                {soldCompCountForTrust > 0
                  ? `Only ${soldCompCountForTrust} sold listing${soldCompCountForTrust === 1 ? '' : 's'} matched — we need at least 10 before showing a resale price.`
                  : 'Not enough live sold listings to price this reliably yet.'}
              </p>
              <a
                href={ebayDeepLink}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center justify-center gap-2 w-full py-3 rounded-xl bg-yellow-500 text-white text-sm font-bold hover:bg-yellow-600 transition-colors cursor-pointer"
              >
                <i className="ri-external-link-line" aria-hidden />
                Browse sold listings on eBay
                <i className="ri-arrow-right-line" aria-hidden />
              </a>
            </div>
          ) : (
          <div className="grid grid-cols-3 gap-2.5">
            <div className="bg-gray-50 rounded-2xl p-3.5 text-center border border-gray-100">
              <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-1">Resale</p>
              <p className="text-xl font-black text-gray-900">£{resaleValue}</p>
            </div>
            <div className={`rounded-2xl p-3.5 text-center border ${netProfit >= 0 ? 'bg-emerald-50 border-emerald-100' : 'bg-rose-50 border-rose-100'}`}>
              <p className={`text-[10px] font-semibold uppercase tracking-wider mb-1 ${netProfit >= 0 ? 'text-emerald-500' : 'text-rose-500'}`}>Net Profit</p>
              <p className={`text-xl font-black ${netProfit >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                {netProfit >= 0 ? '' : '-'}£{Math.abs(netProfit)}
              </p>
            </div>
            <div className="bg-gray-50 rounded-2xl p-3.5 text-center border border-gray-100">
              <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-1">Max Buy</p>
              <p className="text-xl font-black text-gray-900">£{maxBuyPrice}</p>
              <p className="text-[9px] text-gray-400 mt-1 leading-tight">
                ~{feePct}% fees + £{shippingGbp ?? 4} ship + £{marginBufferGbp} buffer
              </p>
            </div>
          </div>
          )}

          {pricesLoading ? (
            <div className="rounded-2xl border border-gray-100 bg-gray-50/80 px-4 py-3 space-y-2 animate-pulse" aria-busy>
              <div className="h-2.5 bg-gray-200 rounded w-40" />
              <div className="h-3 bg-gray-200 rounded w-full" />
              <div className="h-3 bg-gray-200 rounded w-[90%]" />
              <div className="h-3 bg-gray-200 rounded w-[75%]" />
            </div>
          ) : !showManualBrowse &&
            ((platformFeeGbp !== undefined && platformFeeGbp > 0) ||
              (shippingGbp !== undefined && shippingGbp > 0)) ? (
            <div className="rounded-2xl border border-gray-100 bg-gray-50/80 px-4 py-3 space-y-1.5">
              <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Fee breakdown &amp; net</p>
              <div className="flex justify-between text-xs text-gray-700">
                <span>Est. resale</span>
                <span className="font-semibold">£{resaleValue}</span>
              </div>
              {purchaseCost != null && purchaseCost > 0 && (
                <div className="flex justify-between text-xs text-gray-700">
                  <span>Your buy price</span>
                  <span className="font-semibold">−£{purchaseCost}</span>
                </div>
              )}
              {platformFeeGbp != null && platformFeeGbp > 0 && (
                <div className="flex justify-between text-xs text-gray-700">
                  <span>Platform fees (~{feePct}%)</span>
                  <span className="font-semibold">−£{platformFeeGbp}</span>
                </div>
              )}
              {shippingGbp != null && shippingGbp > 0 && (
                <div className="flex justify-between text-xs text-gray-700">
                  <span>Shipping est.</span>
                  <span className="font-semibold">−£{shippingGbp}</span>
                </div>
              )}
              <div className="flex justify-between text-xs font-bold text-gray-900 pt-1 border-t border-gray-200">
                <span>Net profit</span>
                <span>{netProfit >= 0 ? '' : '−'}£{Math.abs(netProfit)}</span>
              </div>
              <p className="text-[10px] text-gray-400 leading-snug">
                Max buy £{maxBuyPrice} = resale minus ~{feePct}% fees, £{shippingGbp ?? 4} shipping, and a £
                {marginBufferGbp} margin buffer (same basis as the edge scan).
              </p>
            </div>
          ) : null}

          {!pricesLoading && (comparables || comparablesUnavailableReason) ? (
            <div className={stageFade(5)}>
              <ComparablesSection
                comparables={comparables}
                averagePrice={comparablesAveragePrice}
                overallConfidence={comparablesOverallConfidence}
                removedIds={removedComparableIds ?? new Set()}
                onRemove={onRemoveComparable}
                pricesLoading={pricesLoading}
                unavailableReason={comparablesUnavailableReason}
              />
            </div>
          ) : null}

          {/* ── eBay section ── */}
          <div className="space-y-2.5">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
              <div className="flex flex-wrap items-center gap-2 min-w-0">
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">eBay Sold</p>
                {!pricesLoading ? (
                  <span
                    className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${
                      identificationFromCache
                        ? 'bg-sky-50 text-sky-800 border-sky-200'
                        : 'bg-indigo-50 text-indigo-800 border-indigo-200'
                    }`}
                  >
                    {identificationFromCache ? 'Quick ID · live comps' : 'Deep scan'}
                  </span>
                ) : null}
              </div>
              {pricesLoading ? (
                <div className="h-10 w-28 rounded-xl bg-gray-200 animate-pulse border border-gray-100" aria-hidden />
              ) : (
                <PlatformAvgPill
                  name="eBay"
                  avgPrice={ebayPlatform?.avgPrice ?? 0}
                  colorClass="bg-yellow-50 text-yellow-700 border-yellow-200"
                />
              )}
            </div>

            {similarTop.length > 0 ? (
              <div className="space-y-2">
                <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Similar recent sales</p>
                <div className="grid grid-cols-3 gap-2">
                  {similarTop.map((listing) => (
                    <EbayListingCard key={listing.id} listing={listing} featured />
                  ))}
                </div>
              </div>
            ) : null}

            {moreComps.length > 0 ? (
              <div className="space-y-2">
                <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">More sold comps</p>
                <div className="flex gap-2.5 overflow-x-auto pb-1 scrollbar-hide -mx-1 px-1">
                  {moreComps.map((listing) => (
                    <EbayListingCard key={listing.id} listing={listing} />
                  ))}
                </div>
              </div>
            ) : similarTop.length === 0 && ebayListings.length > 0 ? (
              <div className="flex gap-2.5 overflow-x-auto pb-1 scrollbar-hide -mx-1 px-1">
                {ebayListings.map((listing) => (
                  <EbayListingCard key={listing.id} listing={listing} />
                ))}
              </div>
            ) : null}

            {!pricesLoading && !showManualBrowse && ebayScrapedLive && ebaySampleListings >= 10 && ebaySampleListings < 15 ? (
              <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-900 flex gap-2 items-start">
                <i className="ri-alert-line shrink-0 mt-0.5" aria-hidden />
                <span>{COPY_LIMITED_DATA}</span>
              </div>
            ) : null}

            {!pricesLoading && showPriceFallback ? (
              <div className="rounded-xl border border-gray-200 bg-gray-50 px-3 py-2 text-xs font-medium text-gray-700 flex gap-2 items-start">
                <i className="ri-price-tag-3-line shrink-0 mt-0.5 text-gray-500" aria-hidden />
                <span>{COPY_FALLBACK}</span>
              </div>
            ) : null}

            <a
              href={ebayDeepLink}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1.5 text-xs font-semibold text-yellow-700 hover:text-yellow-800 transition-colors cursor-pointer"
            >
              <i className="ri-external-link-line"></i>
              See all sold listings on eBay
              <i className="ri-arrow-right-line"></i>
            </a>

            {!pricesLoading && scanId ? (
              <div className="rounded-xl border border-gray-100 bg-gray-50/90 px-3 py-3 space-y-2">
                <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Profit tracking</p>
                <div className="flex flex-wrap gap-2">
                  {onOpenMarkBought ? (
                    <button
                      type="button"
                      onClick={onOpenMarkBought}
                      disabled={Boolean(boughtAt)}
                      className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-white border border-gray-200 text-xs font-semibold text-gray-800 hover:border-gray-300 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer whitespace-nowrap"
                    >
                      <i className="ri-shopping-bag-line text-sm" />
                      {boughtAt ? 'Bought' : 'Mark bought'}
                    </button>
                  ) : null}
                  {onOpenMarkSold ? (
                    <button
                      type="button"
                      onClick={onOpenMarkSold}
                      disabled={!boughtAt || Boolean(soldAt)}
                      className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-white border border-gray-200 text-xs font-semibold text-gray-800 hover:border-gray-300 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer whitespace-nowrap"
                      title={!boughtAt ? 'Mark as bought first' : undefined}
                    >
                      <i className="ri-price-tag-3-line text-sm" />
                      {soldAt ? 'Sold' : 'Mark sold'}
                    </button>
                  ) : null}
                </div>
              </div>
            ) : null}
          </div>

          {/* ── Vinted section ── */}
          <div className="space-y-2.5">
            <a
              href={vintedDeepLink}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center justify-center gap-2 w-full py-3 rounded-xl bg-[#1a3d2b] text-white text-sm font-semibold hover:bg-[#2d5a40] transition-all cursor-pointer whitespace-nowrap"
            >
              Browse similar on Vinted
              <i className="ri-arrow-right-line"></i>
            </a>
          </div>

          {/* ── Depop section ── */}
          <div className="space-y-2.5">
            <a
              href={depopDeepLink}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center justify-center gap-2 w-full py-3 rounded-xl bg-[#1a3d2b] text-white text-sm font-semibold hover:bg-[#2d5a40] transition-all cursor-pointer whitespace-nowrap"
            >
              Browse similar on Depop
              <i className="ri-arrow-right-line"></i>
            </a>
          </div>

          {/* Data freshness */}
          <div className="py-2 border-t border-gray-100 space-y-1">
            <p className="text-xs text-gray-500 flex gap-1.5 items-start leading-relaxed">
              <i className="ri-time-line shrink-0 mt-0.5" aria-hidden />
              <span>{pricesLoading ? 'Fetching live sold prices and margin…' : dataFreshnessLine}</span>
            </p>
            {!pricesLoading && priceExtractionMethod ? (
              <p className="text-[11px] text-gray-400 pl-5">
                Price source:{' '}
                {priceExtractionMethod === 'finding_api'
                  ? 'eBay Finding API (sold listings)'
                  : priceExtractionMethod === 'vision'
                    ? 'AI vision on live marketplace screenshot'
                    : 'HTML parsing fallback'}
              </p>
            ) : null}
          </div>

          {/* WHY MARGINN SAID */}
          {explainFlags.length > 0 && !pricesLoading && (
            <div className="bg-gray-50 rounded-2xl border border-gray-100 px-4 py-4">
              <p className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-3 flex items-center gap-1.5">
                <i className="ri-lightbulb-line text-amber-500"></i>
                Why Marginn Said {verdict}
              </p>
              <ul className="space-y-2">
                {explainFlags.map((flag, i) => (
                  <li key={i} className="flex items-start gap-2.5">
                    <div className="w-4 h-4 flex items-center justify-center mt-0.5 flex-shrink-0">
                      <i className="ri-arrow-right-s-line text-emerald-500 text-sm"></i>
                    </div>
                    <p className="text-sm text-gray-700 leading-snug">{flag}</p>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Risk Flags */}
          {flags.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Risk Flags</p>
              {flags.map((flag) => {
                const fc = FLAG_CONFIG[flag] ?? { icon: 'ri-flag-line', color: 'text-gray-700', bg: 'bg-gray-50 border-gray-200', desc: '' };
                return (
                  <div key={flag} className={`flex items-start gap-3 rounded-xl border px-3.5 py-3 ${fc.bg}`}>
                    <div className={`w-5 h-5 flex items-center justify-center mt-0.5 flex-shrink-0 ${fc.color}`}>
                      <i className={`${fc.icon} text-sm`}></i>
                    </div>
                    <div>
                      <p className={`text-xs font-bold tracking-wide ${fc.color}`}>{flag}</p>
                      {fc.desc && <p className="text-xs text-gray-500 mt-0.5">{fc.desc}</p>}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* After scan: watchlist, outcomes, brand context */}
          {scanId && !pricesLoading ? (
            <div className="rounded-2xl border border-gray-100 bg-gray-50/80 px-4 py-4 space-y-3">
              <p className="text-xs font-bold text-gray-500 uppercase tracking-wider">After the scan</p>
              {brandHistoryLine ? (
                <p className="text-xs text-gray-700 leading-relaxed">{brandHistoryLine}</p>
              ) : null}
              <div className="flex flex-wrap gap-2">
                {onWatchPrice ? (
                  <button
                    type="button"
                    onClick={() => void onWatchPrice()}
                    disabled={watchPriceBusy || onWatchlist}
                    className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-white border border-gray-200 text-xs font-semibold text-gray-800 hover:border-gray-300 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer whitespace-nowrap"
                  >
                    <i className="ri-eye-line text-sm" />
                    {onWatchlist ? 'Watching price' : 'Watch price'}
                  </button>
                ) : null}
              </div>
              {onWatchlist && watchUntilLabel ? (
                <p className="text-[11px] text-emerald-800 font-medium">
                  Watching until {watchUntilLabel}
                </p>
              ) : null}
              {onWatchPrice && !onWatchlist ? (
                <p className="text-[11px] text-gray-500 leading-relaxed">{resaleWatchHint}</p>
              ) : null}
              <p className="text-[10px] text-gray-400 leading-snug">
                Server-side 48h cron is not enabled — alerts run when you open the app. Optional Supabase pg_cron
                + Edge can be added later.
              </p>
            </div>
          ) : null}

          {/* Action buttons */}
          <div className={`grid gap-3 pt-1 ${shareUrl?.trim() ? 'grid-cols-3' : 'grid-cols-2'}`}>
            <button
              onClick={onRescan}
              className="flex items-center justify-center gap-2 py-3 rounded-xl border-2 border-gray-200 text-sm font-semibold text-gray-700 hover:border-gray-300 hover:bg-gray-50 transition-all cursor-pointer whitespace-nowrap"
            >
              <i className="ri-camera-line"></i>
              New photo
            </button>
            {shareUrl?.trim() ? (
              <button
                type="button"
                onClick={handleShare}
                disabled={shareBusy}
                className="flex items-center justify-center gap-2 py-3 rounded-xl border-2 border-gray-200 text-sm font-semibold text-gray-700 hover:border-gray-300 hover:bg-gray-50 transition-all cursor-pointer whitespace-nowrap disabled:opacity-50"
              >
                <i className={`ri-share-forward-line ${shareBusy ? 'animate-pulse' : ''}`}></i>
                Share
              </button>
            ) : null}
            <button
              onClick={handleSave}
              className={`flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-semibold transition-all cursor-pointer whitespace-nowrap shadow-lg ${
                saved ? 'bg-emerald-500 text-white shadow-emerald-200' : 'bg-black text-white hover:bg-gray-900 shadow-black/10'
              }`}
            >
              <i className={saved ? 'ri-check-line' : 'ri-bookmark-fill'}></i>
              {saved ? 'Saved!' : 'Save Item'}
            </button>
          </div>

        </div>
      </div>
    </div>
  );
}
