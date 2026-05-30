/** Case-insensitive brand match for user-owned scan rows. */
export function normalizeBrandKey(brand: string): string {
  return brand.trim().toLowerCase();
}

export interface BrandRoiRow {
  id: string;
  brand_name: string | null;
  roi: number | null;
}

export function countPeersSameBrand(
  rows: BrandRoiRow[],
  brand: string,
  excludeScanId?: string | null
): { otherCount: number; avgRoiPct: number | null } {
  const key = normalizeBrandKey(brand);
  if (!key) return { otherCount: 0, avgRoiPct: null };
  const peers = rows.filter(
    (r) =>
      normalizeBrandKey(String(r.brand_name ?? '')) === key &&
      (!excludeScanId || r.id !== excludeScanId)
  );
  const withRoi = peers.filter((r) => r.roi != null && !Number.isNaN(Number(r.roi)));
  const avgRoiPct =
    withRoi.length > 0
      ? Math.round(withRoi.reduce((s, r) => s + Number(r.roi), 0) / withRoi.length)
      : null;
  return { otherCount: peers.length, avgRoiPct };
}

export function formatBrandHistoryLine(
  brandLabel: string,
  otherCount: number,
  avgRoiPct: number | null
): string | null {
  if (otherCount <= 0) return null;
  const roiPart =
    avgRoiPct != null && !Number.isNaN(avgRoiPct)
      ? `avg ROI ${avgRoiPct}%`
      : 'ROI will show once scans include a buy price';
  return `You've scanned ${otherCount} other ${brandLabel} piece${otherCount === 1 ? '' : 's'}, ${roiPart}.`;
}

export interface BestBrandStat {
  brand: string;
  scanCount: number;
  avgRoiPct: number;
}

const MIN_BRAND_SCANS = 2;

/** Best brand by average ROI among brands with at least `minScans` scans (ROI required). */
export function pickBestBrandByAvgRoi(
  rows: BrandRoiRow[],
  minScans: number = MIN_BRAND_SCANS
): BestBrandStat | null {
  const byBrand = new Map<string, { rois: number[]; display: string }>();
  for (const r of rows) {
    const raw = String(r.brand_name ?? '').trim();
    if (!raw) continue;
    const k = normalizeBrandKey(raw);
    if (!k || k === 'unknown' || k === 'unknown brand') continue;
    if (r.roi == null || Number.isNaN(Number(r.roi))) continue;
    const roi = Number(r.roi);
    const cur = byBrand.get(k);
    if (cur) {
      cur.rois.push(roi);
    } else {
      byBrand.set(k, { rois: [roi], display: raw });
    }
  }
  let best: BestBrandStat | null = null;
  for (const [, v] of byBrand) {
    if (v.rois.length < minScans) continue;
    const avg = v.rois.reduce((a, b) => a + b, 0) / v.rois.length;
    const avgRoiPct = Math.round(avg);
    if (!best || avgRoiPct > best.avgRoiPct) {
      best = { brand: v.display, scanCount: v.rois.length, avgRoiPct };
    }
  }
  return best;
}
