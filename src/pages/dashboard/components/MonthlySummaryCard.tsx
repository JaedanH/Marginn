import Card from '../../../components/base/Card';

const CO2_KG_PER_SCAN = 2.1;

export interface MonthStats {
  scans: number;
  profit: number;
  co2Kg: number;
}

interface MonthlySummaryCardProps {
  thisMonth: MonthStats;
  lastMonth: MonthStats;
}

function Delta({ cur, prev, suffix = '' }: { cur: number; prev: number; suffix?: string }) {
  if (prev === 0 && cur === 0) return <span className="text-gray-400 text-xs">—</span>;
  if (prev === 0) return <span className="text-emerald-600 text-xs font-semibold">new</span>;
  const pct = Math.round(((cur - prev) / prev) * 100);
  const up = cur >= prev;
  return (
    <span className={`text-xs font-semibold ${up ? 'text-emerald-600' : 'text-rose-600'}`}>
      {up ? '↑' : '↓'} {Math.abs(pct)}%{suffix}
    </span>
  );
}

export default function MonthlySummaryCard({ thisMonth, lastMonth }: MonthlySummaryCardProps) {
  return (
    <Card className="p-6 h-full">
      <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-4">This month vs last</h2>
      <div className="grid grid-cols-2 gap-4">
        <div>
          <p className="text-xs text-gray-400 mb-1">Scans</p>
          <div className="flex items-baseline gap-2 flex-wrap">
            <span className="text-2xl font-bold text-black">{thisMonth.scans}</span>
            <span className="text-sm text-gray-400">vs {lastMonth.scans}</span>
          </div>
          <div className="mt-1">
            <Delta cur={thisMonth.scans} prev={lastMonth.scans} />
          </div>
        </div>
        <div>
          <p className="text-xs text-gray-400 mb-1">Profit tracked (£)</p>
          <div className="flex items-baseline gap-2 flex-wrap">
            <span className="text-2xl font-bold text-emerald-600">£{Math.round(thisMonth.profit)}</span>
            <span className="text-sm text-gray-400">vs £{Math.round(lastMonth.profit)}</span>
          </div>
          <div className="mt-1">
            <Delta cur={thisMonth.profit} prev={lastMonth.profit} />
          </div>
        </div>
        <div className="col-span-2 pt-2 border-t border-gray-100">
          <p className="text-xs text-gray-400 mb-1">CO₂ saved (est.)</p>
          <div className="flex items-baseline gap-2 flex-wrap">
            <span className="text-xl font-bold text-teal-700">{thisMonth.co2Kg.toFixed(1)} kg</span>
            <span className="text-sm text-gray-400">vs {lastMonth.co2Kg.toFixed(1)} kg</span>
            <span className="text-[10px] text-gray-400 ml-auto">× {CO2_KG_PER_SCAN} kg / scan</span>
          </div>
          <div className="mt-1">
            <Delta cur={thisMonth.co2Kg} prev={lastMonth.co2Kg} />
          </div>
        </div>
      </div>
    </Card>
  );
}
