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
  encodeImageForScan,
  readNdjsonScanResponse,
  type AnalyseItemCompletePayload,
  type AnalyseItemMargin,
} from '../../lib/scanEdgeResponse';

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
}

type ScanMode = 'Safe' | 'Standard' | 'Aggressive';

const SCAN_UPLOAD_TIP_KEY = 'marginn_scan_upload_tip_dismissed';

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

// Condition multiplier applied to baseline resale price
const CONDITION_MULTIPLIER: Record<string, number> = {
  LIKE_NEW: 1.0,
  GOOD: 0.85,
  LIGHT_WEAR: 0.72,
  FADED: 0.55,
  CRACKED_LOGO: 0.45,
  STAINS: 0.35,
  HEAVY_WEAR: 0.30,
};

const PLATFORM_FEES_RATE = 0.12;
const SHIPPING_COST = 4;

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
  const trendScore = (aiData.trend_score as number) ?? 5;
  const colour = (aiData.colour as string) ?? '';
  const gender = (aiData.gender as string) ?? '';

  // eBay sold listings already reflect real market prices for items in any condition.
  // Use eBay avg directly as resaleValue — NO condition multiplier on top.
  // Only fall back to brand baseline × condition multiplier if eBay has no data.
  const brandBaseline = brandRow ? Number(brandRow.baseline_resale_gbp ?? 40) : 40;
  const resaleValue = (livePrices?.ebay.scraped && livePrices.ebay.avg > 0)
    ? Math.round(livePrices.ebay.avg)
    : Math.round(brandBaseline * conditionMult);

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

  const ebayListings = livePrices?.ebay.scraped ? livePrices.ebay.listings : 61;
  const ebaySoldCount = livePrices?.ebay.scraped ? livePrices.ebay.soldCount : 49;

  const buyPriceNum = buyPriceStr ? parseFloat(buyPriceStr) : 0;
  const platformFees = Math.round(resaleValue * PLATFORM_FEES_RATE);
  const netProfit = Math.round(resaleValue - buyPriceNum - platformFees - SHIPPING_COST);
  const maxBuyPrice = Math.round(resaleValue - platformFees - SHIPPING_COST - 10);
  const verdict = deriveVerdict(netProfit, mode);

  const flags: string[] = [];
  if (brandConfidence < 0.6) flags.push('LOW CONFIDENCE');
  if (['FADED', 'CRACKED_LOGO', 'STAINS', 'HEAVY_WEAR'].includes(conditionGrade)) flags.push('CONDITION PENALTY');
  if (mode === 'Aggressive') flags.push('HIGH COMPETITION');
  if (trendScore >= 12) flags.push('PRICE VOLATILE');

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
      { name: 'Vinted', avgPrice: vintedAvg, listings: 0, soldListings: 0, url: 'https://vinted.co.uk' },
      { name: 'Depop', avgPrice: depopAvg, listings: 0, soldListings: 0, url: 'https://depop.com' },
      { name: 'eBay', avgPrice: ebayAvg, listings: ebayListings, soldListings: ebaySoldCount, url: 'https://ebay.co.uk' },
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
    shippingGbp: SHIPPING_COST,
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
  const conditionLabel = CONDITION_LABEL[conditionGrade] ?? conditionGrade;
  const brandConfidence = (data.brand_confidence as number) ?? 0;
  const resalePrice = (data.resale_price as number) ?? 0;
  const netAfterFees = (data.net_after_fees as number) ?? 0;
  const profitFromAPI = (data.profit as number) ?? 0;
  const platformFeesCalc = Math.round(resalePrice * PLATFORM_FEES_RATE);
  const maxBuyFromApi = (data.max_buy as number) ?? 0;
  const maxBuy =
    maxBuyFromApi > 0
      ? maxBuyFromApi
      : Math.round(resalePrice - platformFeesCalc - SHIPPING_COST - 10);
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
    platforms: [
      { name: 'Vinted', avgPrice: vintedPrice, listings: 0, soldListings: 0, url: 'https://vinted.co.uk' },
      { name: 'Depop', avgPrice: depopPrice, listings: 0, soldListings: 0, url: 'https://depop.com' },
      { name: 'eBay', avgPrice: ebayPrice, listings: ebayCount, soldListings: ebayCount, url: 'https://ebay.co.uk' },
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
    shippingGbp: SHIPPING_COST,
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
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [buyPrice, setBuyPrice] = useState('');
  const [scanMode, setScanMode] = useState<ScanMode>('Standard');
  const [isScanning, setIsScanning] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [scanStep, setScanStep] = useState(1);
  const [brandsCount, setBrandsCount] = useState<number | null>(null);
  const [ebayListings, setEbayListings] = useState<ListingCacheRow[]>([]);
  const [flagsOpen, setFlagsOpen] = useState(false);
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

  const handleFile = (file: File) => {
    if (file.size > 10 * 1024 * 1024) { setError('File must be under 10MB'); return; }
    if (!file.type.startsWith('image/')) { setError('Please select an image file'); return; }
    setError(null);
    setSelectedFile(file);
    const reader = new FileReader();
    reader.onload = (e) => {
      if (e.target?.result) {
        setSelectedImage(e.target.result as string);
      }
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
    setScanStep(1);
    setEbayListings([]);

    try {
      const encoded = await encodeImageForScan(selectedFile);
      if (!encoded.base64) {
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

      const res = await fetch(EDGE_FN_URL, {
        method: 'POST',
        headers: await edgeFunctionAuthHeaders({ session: scanSession }),
        body: JSON.stringify({
          // Edge image validator accepts data URLs or raw base64 + mimeType; data URL is unambiguous.
          image_base64: `data:${encoded.mimeType};base64,${encoded.base64}`,
          image_type: encoded.mimeType,
          buy_price: buyPrice ? parseFloat(buyPrice) : 0,
          mode: scanMode.toLowerCase(),
          user_id: effectiveUserId,
          stream: true,
          ...(partnerShopForBody ? { partner_shop_id: partnerShopForBody } : {}),
        }),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error((errData as { error?: string }).error ?? `Request failed (${res.status})`);
      }

      const contentType = res.headers.get('content-type') ?? '';
      let responseData: Record<string, unknown>;
      if (contentType.includes('application/x-ndjson')) {
        responseData = await readNdjsonScanResponse(res, () => setScanStep(2));
        setScanStep(3);
        await new Promise<void>((r) => setTimeout(r, 280));
        setScanStep(4);
        await new Promise<void>((r) => setTimeout(r, 220));
      } else {
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
        result = buildResultFromNewAPI(responseData, buyPrice, scanMode, selectedImage);
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
        result = buildResultFromAI(ai, brand, buyPrice, scanMode, selectedImage, livePrices);
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

      const margin = responseData.margin as AnalyseItemMargin | undefined;
      if (margin && typeof margin.resale_gbp === 'number') {
        result = applyAnalyseItemMargin(result, margin, scanMode);
      }

      const fpRaw = (responseData as { fingerprint?: unknown }).fingerprint;
      const fingerprintFromEdge = typeof fpRaw === 'string' && fpRaw.trim() ? fpRaw.trim() : '';
      result = {
        ...result,
        fingerprint: fingerprintFromEdge || clientScanFingerprintFallback(result),
      };

      setIdentifiedItem(result);
      setActiveTab('results');

      const persist = (responseData as AnalyseItemCompletePayload).scanPersist;
      const edgeSaysScanSaved = persist?.ok === true;

      // ── Ensure scans row exists (edge fn uses scanId as PK; anon client fallback) ─
      const aiFromResponse =
        responseData.brand_name !== undefined
          ? (responseData as Record<string, unknown>)
          : (responseData as { ai?: Record<string, unknown> }).ai ?? {};
      const persistedImageUrl =
        (responseData as { imageUrl?: string }).imageUrl?.trim() || null;
      const buyPriceNum = buyPrice ? parseFloat(buyPrice) : 0;

      if (effectiveUserId && result.scanId) {
        console.log('[Scan] checking if scan row exists in DB', { scanId: result.scanId });

        const { data: existingRow, error: selectErr } = await supabase
          .from('scans')
          .select('id')
          .eq('id', result.scanId)
          .maybeSingle();

        if (selectErr) {
          console.error('[Scan] SELECT check failed:', selectErr);
        }

        if (existingRow) {
          console.log('[Scan] scan row already in DB (edge fn wrote it) ✅', result.scanId);
        } else if (edgeSaysScanSaved) {
          console.warn(
            '[Scan] Edge reported scans insert OK but SELECT returned no row — check RLS/policies or wait and refresh history.',
          );
        } else {
          console.warn('[Scan] scan row NOT in DB — inserting from frontend as fallback');
          const conditionGrade =
            typeof aiFromResponse.condition_grade === 'string'
              ? aiFromResponse.condition_grade
              : 'GOOD';
          const resaleVal = result.resaleValue ?? 0;
          const fallbackRow = {
            id: result.scanId,
            user_id: effectiveUserId,
            brand_name: result.brand,
            brand_confidence: (aiFromResponse.brand_confidence as number) ?? 0,
            item_type_bucket: (aiFromResponse.item_type_bucket as string) ?? 'MED',
            condition_grade: conditionGrade,
            trend_score: (aiFromResponse.trend_score as number) ?? 5,
            buy_price_gbp: buyPriceNum || null,
            expected_resale_gbp: resaleVal,
            resale_adj_gbp: resaleVal,
            net_gbp:
              buyPriceNum > 0
                ? Math.round(resaleVal - buyPriceNum - resaleVal * 0.12 - 4)
                : null,
            profit_gbp:
              buyPriceNum > 0
                ? Math.round(resaleVal - buyPriceNum - resaleVal * 0.12 - 4)
                : null,
            roi:
              buyPriceNum > 0
                ? Math.round(((resaleVal - buyPriceNum) / buyPriceNum) * 100)
                : null,
            mode: scanMode.toUpperCase(),
            platform: 'web',
            decision: result.verdict ?? 'MAYBE',
            image_url: persistedImageUrl,
            ...(partnerShopForBody ? { partner_shop_id: partnerShopForBody } : {}),
          };
          const { error: insertErr } = await supabase.from('scans').insert(fallbackRow);
          if (insertErr) {
            console.error('[Scan] fallback scans INSERT FAILED:', {
              code: insertErr.code,
              message: insertErr.message,
              details: insertErr.details,
              hint: insertErr.hint,
            });
            const pe = persist?.error;
            showToast(
              pe
                ? `Could not save scan to history (${pe.code}). ${insertErr.message}`
                : `Could not save scan to history: ${insertErr.message}`,
              'error',
            );
          } else {
            console.log('[Scan] fallback scans INSERT succeeded ✅', result.scanId);
          }
        }
      } else if (!result.scanId) {
        console.warn('[Scan] no scanId returned from edge function — scan_id FK will be null on save');
      }
      // ─────────────────────────────────────────────────────────────────────

      // ── Decrement scan count for limited-plan users ───────────────────────
      try {
        await decrementScan();
      } catch (decrementErr) {
        console.error('[Scan] Failed to decrement scan count:', decrementErr);
      }
      // ─────────────────────────────────────────────────────────────────────

    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Scan failed. Please try again.';
      setError(msg);
    } finally {
      setIsScanning(false);
      setScanStep(1);
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

  const showScanCount =
    profile && ['free', 'drop_in', 'scout'].includes(profile.plan ?? 'free');

  // ── EMBEDDED TWO-COLUMN LAYOUT ─────────────────────────────────────────────
  if (embedded) {
    return (
      <div className="bg-white rounded-2xl border border-gray-100 p-6 w-full">
        <div className="flex gap-6 w-full">

          {/* ── LEFT COLUMN — 45% ── */}
          <div className="w-[45%] flex-shrink-0 flex flex-col gap-4">

            {/* Upload / Preview area */}
            <div
              onDrop={handleDrop}
              onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
              onDragLeave={() => setDragOver(false)}
              onClick={() => !selectedImage && fileInputRef.current?.click()}
              className={`relative w-full rounded-xl border-2 border-dashed overflow-hidden transition-all cursor-pointer ${
                selectedImage
                  ? 'border-transparent'
                  : dragOver
                  ? 'border-[#1a3d2b] bg-[#1a3d2b]/5'
                  : 'border-gray-200 bg-white hover:border-gray-300 hover:bg-gray-50'
              }`}
              style={{ aspectRatio: '4/3' }}
            >
              {selectedImage ? (
                <>
                  <img
                    src={selectedImage}
                    alt="Item to scan"
                    className="w-full h-full object-cover rounded-xl"
                  />
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setSelectedImage(null);
                      setSelectedFile(null);
                      setIdentifiedItem(null);
                    }}
                    className="absolute top-2 right-2 w-7 h-7 flex items-center justify-center bg-white/90 backdrop-blur-sm rounded-full hover:bg-white transition-all cursor-pointer"
                  >
                    <i className="ri-close-line text-gray-700 text-sm"></i>
                  </button>
                </>
              ) : (
                <>
                  <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 p-6 text-center">
                    <div className="w-14 h-14 flex items-center justify-center rounded-xl bg-gray-100">
                      <i className="ri-camera-line text-2xl text-gray-400"></i>
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-gray-700">Upload Item Photo</p>
                      <p className="text-xs text-gray-400 mt-1">Drag and drop or click to browse</p>
                    </div>
                    <p className="text-xs text-gray-300">JPG, PNG, WEBP · Max 10MB</p>
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
              onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); e.target.value = ''; }}
            />
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); e.target.value = ''; }}
            />

            {/* Error */}
            {error && (
              <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-lg px-3 py-2.5">
                <i className="ri-error-warning-line text-red-500 text-sm"></i>
                <p className="text-xs text-red-700">{error}</p>
              </div>
            )}

            {/* Buy price */}
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

            {/* Scan button */}
            <button
              onClick={handleScan}
              disabled={!selectedImage || isScanning}
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
            {isScanning && (
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
            {!isScanning && identifiedItem && (
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
                  onSave={() => handleSaveItem(identifiedItem)}
                  onRescan={() => {
                    setSelectedImage(null);
                    setSelectedFile(null);
                    setBuyPrice('');
                    setIdentifiedItem(null);
                    setEbayListings([]);
                  }}
                />
              </div>
            )}

          </div>
        </div>
      </div>
    );
  }
  // ── END EMBEDDED LAYOUT ─────────────────────────────────────────────────────

  return (
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
        {isScanning && (
          <div className="w-full flex flex-col items-center justify-center py-8">
            <ScanProgress currentStep={scanStep} />
          </div>
        )}

        {/* ── SCAN TAB ── */}
        {activeTab === 'scan' && !isScanning && (
          <div className="w-full max-w-md">
            <div className="text-center mb-8">
              <h2 className="text-2xl font-bold text-gray-900 mb-1">Scan an Item</h2>
              <p className="text-sm text-gray-500">Upload a photo to get instant resale insights</p>
            </div>

            {/* Upload Area */}
            {selectedImage ? (
              <div className="relative w-full aspect-square rounded-2xl border-2 border-transparent overflow-hidden mb-5">
                <img src={selectedImage} alt="Item to scan" className="w-full h-full object-cover" />
                <div className="absolute inset-0 bg-black/0 hover:bg-black/20 transition-all flex items-center justify-center">
                  <span className="opacity-0 hover:opacity-100 text-white text-sm font-medium bg-black/60 px-3 py-1.5 rounded-full transition-all">
                    Change photo
                  </span>
                </div>
                <div className="absolute top-3 right-3 w-8 h-8 flex items-center justify-center bg-emerald-500 rounded-full shadow-md">
                  <i className="ri-check-line text-white text-base"></i>
                </div>
                <button
                  onClick={() => {
                    setSelectedImage(null);
                    setSelectedFile(null);
                  }}
                  className="absolute top-3 left-3 w-8 h-8 flex items-center justify-center bg-white/90 backdrop-blur-sm rounded-full shadow-md hover:bg-white transition-all cursor-pointer"
                >
                  <i className="ri-close-line text-gray-700 text-base"></i>
                </button>
              </div>
            ) : (
              <div
                onDrop={handleDrop}
                onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
                onDragLeave={() => setDragOver(false)}
                className={`relative w-full rounded-2xl border-2 border-dashed transition-all overflow-hidden mb-5 p-8 ${
                  dragOver
                    ? 'border-black bg-gray-100'
                    : 'border-gray-300 bg-white'
                }`}
              >
                <div className="flex flex-col items-center gap-4 text-center">
                  <div className="w-16 h-16 flex items-center justify-center rounded-2xl bg-gray-100">
                    <i className="ri-camera-line text-3xl text-gray-400"></i>
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-gray-700 mb-1">Choose how to add a photo</p>
                    <p className="text-xs text-gray-400">or drag and drop here</p>
                  </div>

                  {/* Two buttons */}
                  <div className="w-full space-y-3 mt-2">
                    <button
                      onClick={() => cameraInputRef.current?.click()}
                      className="w-full flex items-center justify-center gap-2 bg-black text-white py-3.5 rounded-xl text-sm font-semibold hover:bg-gray-900 transition-all cursor-pointer whitespace-nowrap"
                    >
                      <i className="ri-camera-line text-lg"></i>
                      Take photo with camera
                    </button>
                    <button
                      onClick={() => fileInputRef.current?.click()}
                      className="w-full flex items-center justify-center gap-2 bg-white border-2 border-gray-200 text-gray-700 py-3.5 rounded-xl text-sm font-semibold hover:border-gray-300 hover:bg-gray-50 transition-all cursor-pointer whitespace-nowrap"
                    >
                      <i className="ri-image-line text-lg"></i>
                      Upload from camera roll
                    </button>
                  </div>

                  <p className="text-xs text-gray-400 mt-2">JPG, PNG, WEBP · Max 10MB</p>
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

            {/* Hidden file inputs */}
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
              <div className="mb-4 flex items-center gap-2 bg-red-50 border border-red-200 rounded-xl px-4 py-3">
                <i className="ri-error-warning-line text-red-500"></i>
                <p className="text-sm text-red-700">{error}</p>
              </div>
            )}

            {/* Buy Price */}
            <div className="mb-5">
              <label className="block text-sm font-semibold text-gray-700 mb-2">Buy Price</label>
              <div className="relative">
                <span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-500 font-medium text-sm">£</span>
                <input
                  type="number"
                  value={buyPrice}
                  onChange={(e) => setBuyPrice(e.target.value)}
                  placeholder="0.00"
                  min="0"
                  step="0.01"
                  className="w-full pl-8 pr-4 py-3.5 bg-white border border-gray-200 rounded-xl text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-black/10 focus:border-gray-400 transition-all"
                />
              </div>
              <p className="text-xs text-gray-400 mt-1.5">Enter what you paid or plan to pay</p>
            </div>

            {/* Mode Selector */}
            <div className="mb-7">
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

            {/* Scan Button */}
            <button
              onClick={handleScan}
              disabled={!selectedImage || isScanning}
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
        {activeTab === 'results' && !isScanning && (
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
                  onSave={() => handleSaveItem(identifiedItem)}
                  onRescan={() => {
                    setSelectedImage(null);
                    setSelectedFile(null);
                    setBuyPrice('');
                    setIdentifiedItem(null);
                    setEbayListings([]);
                    setActiveTab('scan');
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
  );
}
