import {
  Bar,
  BarChart,
  ResponsiveContainer,
  XAxis,
  YAxis,
} from 'recharts';
import Card from '../../../components/base/Card';

export interface BrandCountRow {
  brand: string;
  count: number;
}

interface BrandBreakdownChartProps {
  rows: BrandCountRow[];
  topN?: number;
}

export default function BrandBreakdownChart({ rows, topN = 8 }: BrandBreakdownChartProps) {
  const data = rows.slice(0, topN).map((r) => ({
    name: r.brand.length > 22 ? `${r.brand.slice(0, 20)}…` : r.brand,
    full: r.brand,
    count: r.count,
  }));

  if (data.length === 0) {
    return (
      <Card className="p-6 h-full min-h-[220px] flex flex-col items-center justify-center text-center border border-dashed border-gray-200">
        <i className="ri-bar-chart-horizontal-line text-3xl text-gray-300 mb-2" />
        <p className="text-sm font-medium text-gray-600">No brand data yet</p>
        <p className="text-xs text-gray-400 mt-1">Scan a few items to see your top brands.</p>
      </Card>
    );
  }

  return (
    <Card className="p-6 h-full min-h-[280px]">
      <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-4">Top brands by scans</h2>
      <div className="h-[220px] w-full">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart layout="vertical" data={data} margin={{ top: 4, right: 12, left: 4, bottom: 4 }}>
            <XAxis type="number" allowDecimals={false} tick={{ fontSize: 11 }} />
            <YAxis
              type="category"
              dataKey="name"
              width={88}
              tick={{ fontSize: 11 }}
              interval={0}
            />
            <Bar
              dataKey="count"
              fill="#1a3d2b"
              radius={[0, 6, 6, 0]}
            />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </Card>
  );
}
