import { useState, useRef } from 'react';
import { useAuth } from '../../../context/AuthContext';
import { supabaseFunctionUrl } from '../../../lib/supabaseFunctions';
import { buildEffectiveMargin, encodeImageForScan, readNdjsonScanResponse } from '../../../lib/scanEdgeResponse';
import {
  formatScanErrorForDisplay,
  throwFromScanErrorPayload,
} from '../../../lib/pipelineDiagnostics';
import { edgeFunctionAuthHeaders } from '@/supabaseClient';
import DashboardScanResults from './DashboardScanResults';

export interface ScanResult {
  brand_name: string;
  product_line: string;
  brand_confidence: number;
  condition_grade: string;
  condition_notes: string;
  decision: string;
  resale_price: number;
  net_after_fees: number;
  profit: number;
  max_buy: number;
  roi: number;
  platform_prices: {
    ebay: number | null;
    vinted: number | null;
    depop: number | null;
  };
  ebay_count: number;
  explain_flags: string[];
  google_lens_product: string;
  search_term_used: string;
  gpt_verified: boolean;
  colour: string;
  gender: string;
  era: string;
  /** Estimated platform selling fees (12% of resale) */
  platform_fee_gbp?: number;
  /** Fixed shipping assumption (£) */
  shipping_gbp?: number;
}

interface NewScanSectionProps {
  onScanComplete: (results: ScanResult) => void;
  isScanning: boolean;
  setIsScanning: (scanning: boolean) => void;
  scanResults: ScanResult | null;
}

const EDGE_FN_URL = supabaseFunctionUrl('analyse-item');

const PLATFORM_FEES_RATE = 0.12;
const SHIPPING_COST = 4;

const CONDITION_MULT: Record<string, number> = {
  LIKE_NEW: 1.0,
  GOOD: 0.85,
  LIGHT_WEAR: 0.72,
  FADED: 0.55,
  CRACKED_LOGO: 0.45,
  STAINS: 0.35,
  HEAVY_WEAR: 0.3,
};

function isUnknownBrandLabel(s: string): boolean {
  const t = s.trim().toLowerCase();
  return !t || t === 'unknown' || t === 'unknown brand' || t === 'n/a' || t === 'none';
}

function displayBrandFromAi(ai: Record<string, unknown>): string {
  const raw = String(ai.brand_name ?? '').trim();
  if (!isUnknownBrandLabel(raw)) return raw;
  const sub = String(ai.sub_brand ?? '').trim();
  if (sub && !isUnknownBrandLabel(sub)) return sub;
  const parts = [ai.category, ai.style, ai.item_type]
    .map((x) => String(x ?? '').trim())
    .filter((p) => p && !isUnknownBrandLabel(p));
  return parts.length ? `${parts.join(' ')} (brand unclear)` : 'Unknown Brand';
}

function mapEdgeResponseToScanResult(data: Record<string, unknown>, buyPriceStr: string): ScanResult {
  const ai = (data.ai as Record<string, unknown>) ?? {};
  const brandRow = (data.brand as Record<string, unknown> | null) ?? null;
  const live = data.livePrices as
    | {
        ebay: { avg: number; listings: number; soldCount: number; scraped: boolean };
        vinted: { avg: number; listings: number; scraped: boolean };
        depop: { avg: number; listings: number; scraped: boolean };
      }
    | undefined;

  const brandName = displayBrandFromAi(ai);
  const conditionGrade = String(ai.condition_grade ?? 'GOOD');
  const buyNum = buyPriceStr ? parseFloat(buyPriceStr) : 0;
  const resale = buildEffectiveMargin(
    data,
    conditionGrade,
    buyNum > 0 ? buyNum : undefined
  ).resale_gbp;
  const platformFees = Math.round(resale * PLATFORM_FEES_RATE);
  const netAfterFees = Math.round(resale - platformFees - SHIPPING_COST);
  const netProfit = Math.round(resale - buyNum - platformFees - SHIPPING_COST);
  const maxBuy = Math.round(resale - platformFees - SHIPPING_COST - 10);
  const verdict = netProfit >= 20 ? 'BUY' : netProfit >= 5 ? 'MAYBE' : 'SKIP';

  const rawConf = Number(ai.brand_confidence ?? 0);
  const brandConfPct = rawConf > 0 && rawConf <= 1 ? Math.round(rawConf * 100) : Math.round(rawConf);

  const vintedAvg =
    live?.vinted.scraped && live.vinted.avg > 0 ? Math.round(live.vinted.avg) : Math.round(resale * 0.9);
  const depopAvg =
    live?.depop.scraped && live.depop.avg > 0 ? Math.round(live.depop.avg) : Math.round(resale * 1.0);

  return {
    brand_name: brandName,
    product_line: [String(ai.sub_brand ?? ''), String(ai.item_type ?? '')].filter(Boolean).join(' · '),
    brand_confidence: brandConfPct,
    condition_grade: conditionGrade,
    condition_notes: '',
    decision: verdict,
    resale_price: resale,
    net_after_fees: netAfterFees,
    profit: netProfit,
    max_buy: maxBuy,
    roi: buyNum > 0 ? Math.round(((resale - buyNum) / buyNum) * 100) : 0,
    platform_prices: {
      ebay: live?.ebay.scraped ? Math.round(live.ebay.avg) : null,
      vinted: live?.vinted.scraped ? vintedAvg : null,
      depop: live?.depop.scraped ? depopAvg : null,
    },
    ebay_count: live?.ebay.scraped ? live.ebay.listings : 0,
    explain_flags: [],
    google_lens_product: '',
    search_term_used: String(data.searchQuery ?? '').trim() || brandName,
    gpt_verified: false,
    colour: String(ai.colour ?? ''),
    gender: String(ai.gender ?? ''),
    era: String(ai.era ?? ''),
    platform_fee_gbp: platformFees,
    shipping_gbp: SHIPPING_COST,
  };
}

export default function NewScanSection({
  onScanComplete,
  isScanning,
  setIsScanning,
  scanResults,
}: NewScanSectionProps) {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [buyPrice, setBuyPrice] = useState('');
  const [dragOver, setDragOver] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [scanResult, setScanResult] = useState<ScanResult | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const { user, session } = useAuth();

  const handleFile = (file: File) => {
    if (file.size > 10 * 1024 * 1024) { setError('File must be under 10MB'); return; }
    if (!file.type.startsWith('image/')) { setError('Please select an image file'); return; }
    setError(null);
    setSelectedFile(file);
    const reader = new FileReader();
    reader.onload = (e) => {
      if (e.target?.result) setSelectedImage(e.target.result as string);
    };
    reader.onerror = () => setError('Failed to read the file. Please try again.');
    reader.readAsDataURL(file);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  };

  const handleScan = async () => {
    if (!selectedImage || !selectedFile) return;
    setIsScanning(true);
    setError(null);

    try {
      const encoded = await encodeImageForScan(selectedFile);

      const response = await fetch(EDGE_FN_URL, {
        method: 'POST',
        headers: await edgeFunctionAuthHeaders({ session }),
        body: JSON.stringify({
          image_base64: encoded.base64,
          image_type: encoded.mimeType,
          buy_price: parseFloat(buyPrice) || 0,
          mode: 'standard',
          stream: true,
          ...(user?.id ? { user_id: user.id } : {}),
        }),
      });

      if (!response.ok) {
        const errBody = (await response.json().catch(() => ({}))) as Record<string, unknown>;
        throwFromScanErrorPayload(errBody, response.status);
      }

      const contentType = response.headers.get('content-type') ?? '';
      const data = contentType.includes('application/x-ndjson')
        ? await readNdjsonScanResponse(response, {})
        : await response.json();

      if ((data as { error?: string }).error) {
        throw new Error((data as { error: string }).error);
      }

      const result: ScanResult =
        data.ai !== undefined
          ? mapEdgeResponseToScanResult(data as Record<string, unknown>, buyPrice)
          : (() => {
              const buyNum = parseFloat(buyPrice) || 0;
              const resale =
                typeof data.resale_price === 'number' && data.resale_price > 0
                  ? Math.round(data.resale_price)
                  : buildEffectiveMargin(data as Record<string, unknown>, 'GOOD').resale_gbp;
              const pf = Math.round(resale * PLATFORM_FEES_RATE);
              return {
                brand_name: String(data.brand_name || 'Unknown Brand'),
                product_line: String(data.product_line || ''),
                brand_confidence: Number(data.brand_confidence) || 0,
                condition_grade: String(data.condition_grade || ''),
                condition_notes: String(data.condition_notes || ''),
                decision: String(data.decision || 'SKIP'),
                resale_price: resale,
                net_after_fees: Number(data.net_after_fees) || Math.round(resale - pf - SHIPPING_COST),
                profit: Number(data.profit) || 0,
                max_buy: Number(data.max_buy) || 0,
                roi: Number(data.roi) || 0,
                platform_prices: {
                  ebay: data.platform_prices?.ebay ?? null,
                  vinted: data.platform_prices?.vinted ?? null,
                  depop: data.platform_prices?.depop ?? null,
                },
                ebay_count: Number(data.ebay_count) || 0,
                explain_flags: (data.explain_flags as string[]) || [],
                google_lens_product: String(data.google_lens_product || ''),
                search_term_used: String(data.search_term_used || ''),
                gpt_verified: Boolean(data.gpt_verified),
                colour: String(data.colour || ''),
                gender: String(data.gender || ''),
                era: String(data.era || ''),
                platform_fee_gbp: pf,
                shipping_gbp: SHIPPING_COST,
              };
            })();

      setScanResult(result);
      onScanComplete(result);
    } catch (err: unknown) {
      setError(formatScanErrorForDisplay(err));
    } finally {
      setIsScanning(false);
    }
  };

  const handleNewScan = () => {
    setScanResult(null);
    setSelectedFile(null);
    setSelectedImage(null);
    setBuyPrice('');
    setError(null);
  };

  if (scanResult) {
    return (
      <DashboardScanResults
        result={scanResult}
        uploadedImage={selectedImage}
        onNewScan={handleNewScan}
      />
    );
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
      {/* ── LEFT: Upload ── */}
      <div className="bg-white rounded-xl border border-gray-200 p-8">
        <h3 className="text-base font-semibold text-black mb-6">Upload Item Photo</h3>

        {/* Drop zone */}
        {selectedImage ? (
          <div className="relative w-full aspect-square rounded-xl overflow-hidden mb-6 border border-gray-200">
            <img src={selectedImage} alt="Item to scan" className="w-full h-full object-cover" />
            <button
              onClick={() => { setSelectedImage(null); setSelectedFile(null); }}
              className="absolute top-3 left-3 w-8 h-8 flex items-center justify-center bg-white/90 rounded-full cursor-pointer hover:bg-white transition-all"
            >
              <i className="ri-close-line text-gray-700 text-base"></i>
            </button>
            <div className="absolute top-3 right-3 w-8 h-8 flex items-center justify-center bg-[#1a3d2b] rounded-full">
              <i className="ri-check-line text-white text-base"></i>
            </div>
          </div>
        ) : (
          <div
            onDrop={handleDrop}
            onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onClick={() => fileInputRef.current?.click()}
            className={`w-full aspect-square rounded-xl border-2 border-dashed flex flex-col items-center justify-center gap-4 mb-6 cursor-pointer transition-all ${
              dragOver ? 'border-[#1a3d2b] bg-[#1a3d2b]/5' : 'border-gray-300 bg-white hover:border-gray-400 hover:bg-gray-50'
            }`}
          >
            <div className="w-16 h-16 flex items-center justify-center rounded-2xl bg-gray-100">
              <i className="ri-camera-line text-3xl text-gray-400"></i>
            </div>
            <div className="text-center">
              <p className="text-sm font-semibold text-gray-700 mb-1">Upload Item Photo</p>
              <p className="text-xs text-gray-400">Drag &amp; drop or click to browse</p>
              <p className="text-xs text-gray-400 mt-1">JPG, PNG, WEBP · Max 10MB</p>
            </div>
          </div>
        )}

        {/* Hidden inputs */}
        <input
          ref={cameraInputRef}
          type="file"
          accept="image/*"
          capture="environment"
          className="hidden"
          onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); e.target.value = ''; }}
        />
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); e.target.value = ''; }}
        />

        {error && (
          <div className="mb-4 flex items-center gap-2 bg-red-50 border border-red-200 rounded-lg px-4 py-3">
            <i className="ri-error-warning-line text-red-500 shrink-0"></i>
            <p className="text-sm text-red-700">{error}</p>
          </div>
        )}

        {/* Buy Price */}
        <div className="mb-6">
          <label className="block text-sm font-medium text-gray-700 mb-2">Buy Price</label>
          <div className="relative">
            <span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-500 font-medium text-sm">£</span>
            <input
              type="number"
              value={buyPrice}
              onChange={(e) => setBuyPrice(e.target.value)}
              placeholder="0.00"
              min="0"
              step="0.01"
              className="w-full pl-8 pr-4 py-3 bg-white border border-gray-200 rounded-lg text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-[#1a3d2b]/20 focus:border-[#1a3d2b] transition-all"
            />
          </div>
          <p className="text-xs text-gray-400 mt-1.5">Enter what you paid or plan to pay</p>
        </div>

        {/* Scan Button */}
        <button
          onClick={handleScan}
          disabled={!selectedImage || isScanning}
          className="w-full py-3.5 rounded-lg text-sm font-semibold text-white transition-all disabled:opacity-40 disabled:cursor-not-allowed whitespace-nowrap cursor-pointer flex items-center justify-center gap-2"
          style={{ backgroundColor: '#1a3d2b' }}
        >
          {isScanning ? (
            <>
              <i className="ri-loader-4-line animate-spin text-base"></i>
              Scanning item...
            </>
          ) : (
            <>
              <i className="ri-scan-2-line text-base"></i>
              Scan Item
            </>
          )}
        </button>
        <p className="text-center text-xs text-gray-400 mt-3">
          Checks Vinted, eBay, Depop &amp; more in seconds
        </p>
      </div>

      {/* ── RIGHT: Placeholder ── */}
      <div className="bg-white rounded-xl border border-gray-200 p-8 flex flex-col items-center justify-center min-h-[400px]">
        <div className="w-20 h-20 flex items-center justify-center bg-gray-100 rounded-2xl mb-4">
          <i className="ri-search-eye-line text-4xl text-gray-300"></i>
        </div>
        <p className="text-gray-500 font-medium mb-1">Results will appear here</p>
        <p className="text-sm text-gray-400 text-center max-w-xs">
          Upload a photo and hit Scan Item to get instant resale insights
        </p>
      </div>
    </div>
  );
}
