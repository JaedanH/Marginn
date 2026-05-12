import { useState } from 'react';

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
  onSave: () => void;
  onRescan: () => void;
}

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

function EbayListingCard({ listing }: { listing: ListingCacheRow }) {
  const price = listing.price_gbp ?? 0;
  const content = (
    <div className="flex-shrink-0 w-28 bg-white border border-gray-100 rounded-xl overflow-hidden hover:border-gray-200 transition-all">
      {listing.image_url ? (
        <img
          src={listing.image_url}
          alt={listing.title ?? ''}
          className="w-full h-20 object-cover object-top"
          onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
        />
      ) : (
        <div className="w-full h-20 bg-gray-100 flex items-center justify-center">
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
  ebayCount = 0,
  ebayListings = [],
  searchTerm,
  purchaseCost,
  platformFeeGbp,
  platformFeeRate,
  shippingGbp,
  marginBufferGbp = 10,
  fingerprint,
  onSave,
  onRescan,
}: ScanResultCardProps) {
  const [lastUpdated, setLastUpdated] = useState(2);
  const [refreshing, setRefreshing] = useState(false);
  const [saved, setSaved] = useState(false);

  const vc = VERDICT_CONFIG[verdict];

  const handleRefresh = () => {
    setRefreshing(true);
    setTimeout(() => { setLastUpdated(0); setRefreshing(false); }, 1200);
  };

  const handleSave = () => {
    onSave();
    setSaved(true);
    setTimeout(() => setSaved(false), 2500);
  };

  const ebayPlatform = platforms.find((p) => p.name === 'eBay');
  const vintedPlatform = platforms.find((p) => p.name === 'Vinted');
  const depopPlatform = platforms.find((p) => p.name === 'Depop');

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

  return (
    <div className="w-full max-w-md mx-auto">
      <div className="bg-white rounded-3xl overflow-hidden shadow-xl shadow-black/8 border border-gray-100">

        {/* Photo */}
        <div className="relative w-full h-64 bg-gray-100">
          <img src={imageUrl} alt={brand} className="w-full h-full object-cover object-top" />
          <div className={`absolute top-4 right-4 ${vc.bg} ${vc.text} px-5 py-2 rounded-full text-sm font-black tracking-widest shadow-lg ring-4 ${vc.ring}`}>
            {vc.label}
          </div>
          <button
            onClick={handleSave}
            className="absolute top-4 left-4 w-9 h-9 flex items-center justify-center bg-white/90 backdrop-blur-sm rounded-full shadow-md hover:bg-white transition-all cursor-pointer"
          >
            <i className={`${saved ? 'ri-bookmark-fill text-black' : 'ri-bookmark-line text-gray-700'} text-base`}></i>
          </button>
        </div>

        <div className="px-5 pt-5 pb-6 space-y-5">

          {/* Brand + Product Line + Condition */}
          <div className="flex items-start justify-between gap-3">
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
              {fingerprint ? (
                <p className="text-[10px] text-gray-400 mt-1 font-mono tracking-tight" title="Deterministic scan fingerprint">
                  Fingerprint {fingerprint}
                </p>
              ) : null}
            </div>
            <div className="flex flex-col items-end gap-1.5 flex-shrink-0">
              <span className={`px-4 py-1.5 rounded-full text-xs font-black tracking-widest ${vc.bg} ${vc.text}`}>
                {vc.label}
              </span>
              {verdict === 'BUY' && (
                <span className="flex items-center gap-1 bg-green-50 border border-green-200 text-green-700 text-[10px] font-semibold px-2.5 py-1 rounded-full whitespace-nowrap">
                  ♻️ Saves ~2.1kg CO₂
                </span>
              )}
            </div>
          </div>

          {/* Stat boxes */}
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

          {(platformFeeGbp !== undefined && platformFeeGbp > 0) || (shippingGbp !== undefined && shippingGbp > 0) ? (
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

          {/* ── eBay section ── */}
          <div className="space-y-2.5">
            <div className="flex items-center justify-between gap-2">
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">eBay Sold</p>
              <PlatformAvgPill
                name="eBay"
                avgPrice={ebayPlatform?.avgPrice ?? 0}
                colorClass="bg-yellow-50 text-yellow-700 border-yellow-200"
              />
            </div>

            {ebayListings.length > 0 && (
              <div className="flex gap-2.5 overflow-x-auto pb-1 scrollbar-hide -mx-1 px-1">
                {ebayListings.map((listing) => (
                  <EbayListingCard key={listing.id} listing={listing} />
                ))}
              </div>
            )}

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

          {/* Last updated */}
          <div className="flex items-center justify-between py-2 border-t border-gray-100">
            <p className="text-xs text-gray-400">
              <i className="ri-time-line mr-1"></i>
              Prices last updated {lastUpdated === 0 ? 'just now' : `${lastUpdated} mins ago`}
            </p>
            <button
              onClick={handleRefresh}
              disabled={refreshing}
              className="flex items-center gap-1.5 text-xs font-medium text-gray-600 hover:text-black transition-colors cursor-pointer disabled:opacity-50 whitespace-nowrap"
            >
              <i className={`ri-refresh-line text-sm ${refreshing ? 'animate-spin' : ''}`}></i>
              Refresh
            </button>
          </div>

          {/* WHY MARGINN SAID */}
          {explainFlags.length > 0 && (
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

          {/* Action buttons */}
          <div className="grid grid-cols-2 gap-3 pt-1">
            <button
              onClick={onRescan}
              className="flex items-center justify-center gap-2 py-3 rounded-xl border-2 border-gray-200 text-sm font-semibold text-gray-700 hover:border-gray-300 hover:bg-gray-50 transition-all cursor-pointer whitespace-nowrap"
            >
              <i className="ri-scan-2-line"></i>
              Scan Again
            </button>
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
