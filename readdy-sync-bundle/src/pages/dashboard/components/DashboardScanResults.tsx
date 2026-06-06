import { useState } from 'react';
import { ScanResult } from './NewScanSection';
import ComparablesSection from '../../scan/components/ComparablesSection';

interface DashboardScanResultsProps {
  result: ScanResult;
  uploadedImage: string | null;
  onNewScan: () => void;
}

const decisionStyle: Record<string, { bg: string; label: string }> = {
  BUY:   { bg: '#1a3d2b', label: 'BUY' },
  MAYBE: { bg: '#f59e0b', label: 'MAYBE' },
  SKIP:  { bg: '#ef4444', label: 'SKIP' },
};

function buildEbayUrl(searchTerm: string): string {
  const q = encodeURIComponent(searchTerm || '');
  return `https://www.ebay.co.uk/sch/i.html?_nkw=${q}&LH_Sold=1&LH_Complete=1`;
}

function buildVintedUrl(searchTerm: string): string {
  const q = encodeURIComponent(searchTerm || '');
  return `https://www.vinted.co.uk/catalog?search_text=${q}`;
}

function buildDepopUrl(searchTerm: string): string {
  const q = encodeURIComponent(searchTerm || '');
  return `https://www.depop.com/search/?q=${q}`;
}

export default function DashboardScanResults({
  result,
  uploadedImage,
  onNewScan,
}: DashboardScanResultsProps) {
  const [flagsOpen, setFlagsOpen] = useState(false);

  const decision = (result.decision || 'SKIP').toUpperCase();
  const badge = decisionStyle[decision] ?? decisionStyle.SKIP;
  const searchTerm = result.search_term_used || result.brand_name || '';

  const statCards = [
    { label: 'Resale Value', value: result.resale_price, color: 'text-black' },
    { label: 'Net After Fees', value: result.net_after_fees, color: 'text-black' },
    { label: 'Profit', value: result.profit, color: result.profit >= 0 ? 'text-emerald-600' : 'text-red-500' },
    { label: 'Max Buy Price', value: result.max_buy, color: 'text-black' },
  ];

  const platforms = [
    {
      name: 'eBay',
      price: result.platform_prices.ebay,
      subtitle: 'Avg sold price',
      linkLabel: 'See sold listings on eBay →',
      url: buildEbayUrl(searchTerm),
    },
    {
      name: 'Vinted',
      price: result.platform_prices.vinted,
      subtitle: 'Avg listed price',
      linkLabel: 'Browse Vinted UK →',
      url: buildVintedUrl(searchTerm),
    },
    {
      name: 'Depop',
      price: result.platform_prices.depop,
      subtitle: 'Avg listed price',
      linkLabel: 'Browse Depop UK →',
      url: buildDepopUrl(searchTerm),
    },
  ];

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
      {/* ── LEFT: Image + new scan ── */}
      <div className="bg-white rounded-xl border border-gray-200 p-8 flex flex-col">
        {uploadedImage ? (
          <div className="w-full aspect-square rounded-xl overflow-hidden mb-6 border border-gray-100">
            <img src={uploadedImage} alt="Scanned item" className="w-full h-full object-cover" />
          </div>
        ) : (
          <div className="w-full aspect-square rounded-xl bg-gray-100 mb-6 flex items-center justify-center">
            <i className="ri-image-line text-4xl text-gray-300"></i>
          </div>
        )}

        <button
          onClick={onNewScan}
          className="w-full py-3 rounded-lg text-sm font-semibold text-white transition-all whitespace-nowrap cursor-pointer flex items-center justify-center gap-2 hover:opacity-90"
          style={{ backgroundColor: '#1a3d2b' }}
        >
          <i className="ri-scan-2-line text-base"></i>
          Scan Another Item
        </button>
      </div>

      {/* ── RIGHT: Results ── */}
      <div className="space-y-5">

        {/* Brand + decision */}
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <div className="flex items-start justify-between gap-4 mb-3">
            <div>
              <h2 className="text-2xl font-bold text-black leading-tight">{result.brand_name}</h2>
              {result.product_line && (
                <p className="text-sm text-gray-500 mt-0.5">{result.product_line}</p>
              )}
              {result.brand_confidence > 0 && (
                <p className="text-xs text-gray-400 mt-1">{result.brand_confidence}% confidence</p>
              )}
            </div>
            <span
              className="shrink-0 px-4 py-1.5 rounded-full text-white text-sm font-bold whitespace-nowrap"
              style={{ backgroundColor: badge.bg }}
            >
              {badge.label}
            </span>
          </div>

          {/* GPT verified + Google Lens */}
          <div className="flex flex-wrap gap-2 mt-3">
            {result.gpt_verified && (
              <span className="inline-flex items-center gap-1.5 text-xs font-medium text-emerald-700 bg-emerald-50 border border-emerald-200 px-3 py-1 rounded-full">
                <i className="ri-shield-check-line text-sm"></i>
                GPT-4o verified
              </span>
            )}
            {result.google_lens_product && (
              <span className="inline-flex items-center gap-1.5 text-xs font-medium text-gray-600 bg-gray-100 px-3 py-1 rounded-full">
                <i className="ri-search-eye-line text-sm"></i>
                Identified as: {result.google_lens_product}
              </span>
            )}
          </div>
        </div>

        {/* Four stat cards */}
        <div className="grid grid-cols-2 gap-3">
          {statCards.map((card) => (
            <div key={card.label} className="bg-white rounded-xl border border-gray-200 p-4">
              <p className="text-xs text-gray-500 mb-1">{card.label}</p>
              <p className={`text-xl font-bold ${card.color}`}>£{card.value}</p>
              {card.label === 'Max Buy Price' && (
                <p className="text-[10px] text-gray-400 mt-1.5 leading-snug">
                  Resale minus ~12% fees, £{result.shipping_gbp ?? 4} shipping est., and £10 buffer.
                </p>
              )}
            </div>
          ))}
        </div>

        {result.platform_fee_gbp != null && result.platform_fee_gbp > 0 && (
          <div className="bg-white rounded-xl border border-gray-200 p-4 text-sm text-gray-700 space-y-2">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Fee breakdown</p>
            <div className="flex justify-between">
              <span>Platform fees (~12%)</span>
              <span className="font-semibold">£{result.platform_fee_gbp}</span>
            </div>
            <div className="flex justify-between">
              <span>Shipping (est.)</span>
              <span className="font-semibold">£{result.shipping_gbp ?? 4}</span>
            </div>
            <p className="text-xs text-gray-400 pt-1 border-t border-gray-100">
              Net after fees (before buy price): £{result.net_after_fees}. Profit uses your buy price when entered.
            </p>
          </div>
        )}

        {/* Comparable items + platform prices */}
        <ComparablesSection
          comparables={result.comparables ?? null}
          averagePrice={result.comparables_average_price ?? null}
          overallConfidence={result.comparables_overall_confidence ?? null}
          unavailableReason={result.comparables_unavailable_reason ?? null}
        />

        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <h3 className="text-sm font-semibold text-black mb-4">Platform Prices</h3>
          <div className="space-y-4">
            {platforms.map((p) => (
              <div key={p.name} className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-semibold text-black">{p.name}</p>
                  <p className="text-xs text-gray-400">{p.subtitle}</p>
                  <a
                    href={p.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs text-[#1a3d2b] font-medium hover:underline cursor-pointer mt-0.5 inline-block"
                  >
                    {p.linkLabel}
                  </a>
                </div>
                <span className="text-base font-bold text-black">
                  {p.price !== null && p.price !== undefined ? `£${p.price}` : '—'}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Why Marginn said this — collapsible */}
        {result.explain_flags && result.explain_flags.length > 0 && (
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <button
              onClick={() => setFlagsOpen(!flagsOpen)}
              className="w-full flex items-center justify-between px-6 py-4 text-sm font-semibold text-black hover:bg-gray-50 transition-colors cursor-pointer"
            >
              <span>Why Marginn said this</span>
              <i className={`ri-arrow-down-s-line text-gray-400 text-lg transition-transform ${flagsOpen ? 'rotate-180' : ''}`}></i>
            </button>
            {flagsOpen && (
              <div className="px-6 pb-5 border-t border-gray-100">
                <ul className="space-y-2 mt-4">
                  {result.explain_flags.map((flag, i) => (
                    <li key={i} className="flex items-start gap-2 text-sm text-gray-700">
                      <i className="ri-checkbox-circle-line text-[#1a3d2b] mt-0.5 shrink-0 text-base"></i>
                      <span>{flag}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}

      </div>
    </div>
  );
}
