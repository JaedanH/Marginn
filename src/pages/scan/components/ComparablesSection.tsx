import { useState } from 'react';
import {
  formatComparableTimeAgo,
  PLATFORM_BADGE,
  type ComparableListing,
  type ComparablesPayload,
} from '../../../lib/findBestComparables';

export type ComparablesSectionProps = {
  comparables: ComparablesPayload | null;
  averagePrice?: number | null;
  overallConfidence?: number | null;
  removedIds?: Set<string>;
  onRemove?: (listing: ComparableListing) => void;
  pricesLoading?: boolean;
  /** Set when edge response has no `comparables` field (old analyse-item deploy). */
  unavailableReason?: string | null;
};

export default function ComparablesSection({
  comparables,
  averagePrice = null,
  overallConfidence = null,
  removedIds = new Set(),
  onRemove,
  pricesLoading = false,
  unavailableReason = null,
}: ComparablesSectionProps) {
  const [seeAll, setSeeAll] = useState(false);

  if (unavailableReason) {
    return (
      <div className="rounded-2xl border border-amber-100 bg-amber-50/80 px-4 py-4">
        <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Comparable items</p>
        <p className="text-xs text-amber-900 mt-1.5 leading-snug">{unavailableReason}</p>
      </div>
    );
  }

  if (!comparables) return null;

  const visibleTop = (slice: ComparablesPayload['ebay']) =>
    slice.top5.filter((l) => !removedIds.has(l.id));

  const ebayRows = visibleTop(comparables.ebay);
  const vintedRows = visibleTop(comparables.vinted);
  const depopRows = visibleTop(comparables.depop);
  const allVisible = comparables.all_passing.filter((l) => !removedIds.has(l.id));
  const hasAny =
    ebayRows.length > 0 || vintedRows.length > 0 || depopRows.length > 0 || allVisible.length > 0;

  const renderRow = (listing: ComparableListing) => {
    const badge = PLATFORM_BADGE[listing.platform];
    const inner = (
      <div className="flex items-start gap-2 rounded-xl border border-gray-100 bg-white px-3 py-2.5 hover:border-gray-200 transition-colors">
        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-1.5 mb-1">
            <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full border ${badge.className}`}>
              {badge.label}
            </span>
            <span className="text-[10px] font-bold text-emerald-700">{listing.match_percent}% match</span>
          </div>
          <p className="text-xs font-semibold text-gray-900 leading-snug line-clamp-2">{listing.title}</p>
          <div className="flex flex-wrap items-center gap-2 mt-1 text-[10px] text-gray-500">
            <span className="font-black text-gray-900 text-xs">£{listing.price}</span>
            <span>{formatComparableTimeAgo(listing.days_ago)}</span>
          </div>
        </div>
        {onRemove ? (
          <button
            type="button"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              onRemove(listing);
            }}
            className="shrink-0 w-7 h-7 flex items-center justify-center rounded-full text-gray-400 hover:text-rose-600 hover:bg-rose-50 cursor-pointer"
            aria-label="Remove comparable"
          >
            <i className="ri-close-line text-base" />
          </button>
        ) : null}
      </div>
    );
    if (listing.url) {
      return (
        <a key={listing.id} href={listing.url} target="_blank" rel="noopener noreferrer" className="block">
          {inner}
        </a>
      );
    }
    return <div key={listing.id}>{inner}</div>;
  };

  const renderPlatformBlock = (
    label: string,
    rows: ComparableListing[],
    lowConfidence: boolean
  ) => {
    if (rows.length === 0) return null;
    return (
      <div className="space-y-2">
        <div className="flex items-center justify-between gap-2">
          <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">{label}</p>
          {lowConfidence ? (
            <span className="text-[9px] font-semibold text-amber-800 bg-amber-50 border border-amber-200 px-1.5 py-0.5 rounded-full">
              Low confidence
            </span>
          ) : null}
        </div>
        <div className="space-y-2">{rows.map(renderRow)}</div>
      </div>
    );
  };

  return (
    <div className="rounded-2xl border border-gray-100 bg-gray-50/90 px-4 py-4 space-y-3">
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Comparable items</p>
          <p className="text-[11px] text-gray-500 mt-0.5 leading-snug">
            Text-matched listings (55%+). Tap to open; remove outliers to refresh averages.
          </p>
        </div>
        {!pricesLoading && averagePrice != null && averagePrice > 0 ? (
          <div className="text-right shrink-0">
            <p className="text-[9px] font-semibold text-gray-400 uppercase">Comp avg</p>
            <p className="text-sm font-black text-gray-900">£{Math.round(averagePrice)}</p>
          </div>
        ) : null}
      </div>
      {overallConfidence != null && overallConfidence > 0 ? (
        <p className="text-[11px] text-gray-600">
          Match confidence: <span className="font-bold text-gray-900">{overallConfidence}%</span>
        </p>
      ) : null}
      {!hasAny ? (
        <p className="text-xs text-gray-600 leading-snug">
          No listings scored 55%+ on brand, type, condition, and colour. Try a clearer photo or browse
          platform links below.
        </p>
      ) : (
        <>
          {renderPlatformBlock('eBay sold — top matches', ebayRows, comparables.ebay.low_confidence)}
          {renderPlatformBlock('Vinted — top matches', vintedRows, comparables.vinted.low_confidence)}
          {renderPlatformBlock('Depop — top matches', depopRows, comparables.depop.low_confidence)}
          {allVisible.length > 0 ? (
            <button
              type="button"
              onClick={() => setSeeAll((v) => !v)}
              className="text-xs font-semibold text-indigo-700 hover:text-indigo-900 cursor-pointer"
            >
              {seeAll ? 'Hide full comparable list' : `See all comparables (${allVisible.length})`}
            </button>
          ) : null}
          {seeAll ? (
            <div className="space-y-2 max-h-72 overflow-y-auto pr-0.5">{allVisible.map(renderRow)}</div>
          ) : null}
        </>
      )}
    </div>
  );
}
