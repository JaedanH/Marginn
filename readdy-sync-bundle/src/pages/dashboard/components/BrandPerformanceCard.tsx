import Card from '../../../components/base/Card';
import type { BestBrandStat } from '../../../lib/scanBrandAggregates';

interface BrandPerformanceCardProps {
  best: BestBrandStat | null;
}

export default function BrandPerformanceCard({ best }: BrandPerformanceCardProps) {
  if (!best) {
    return (
      <Card className="p-6 border border-dashed border-gray-200 bg-gray-50/60">
        <p className="text-sm font-semibold text-gray-700">Brand performance</p>
        <p className="text-xs text-gray-500 mt-2 leading-relaxed">
          Scan at least two items with ROI from the same brand to see your best-performing label here.
        </p>
      </Card>
    );
  }

  return (
    <Card className="p-6 bg-gradient-to-br from-[#1a3d2b]/5 to-white border border-[#1a3d2b]/15">
      <p className="text-xs font-bold text-[#1a3d2b] uppercase tracking-wider mb-2">Brand performance</p>
      <p className="text-lg font-bold text-gray-900 leading-snug">
        <span className="text-[#1a3d2b]">{best.brand}</span>
        <span className="text-gray-700 font-semibold">: your best performing brand — </span>
        {best.scanCount} scan{best.scanCount === 1 ? '' : 's'}, avg ROI{' '}
        <span className="text-emerald-600">{best.avgRoiPct}%</span>
      </p>
    </Card>
  );
}
