/**
 * Marginn Flip Score meter — data-backed score from Edge (`flip_score`), not Claude `trend_score`.
 *
 * Verdict badge thresholds (aligned with Skip / Maybe / Flip It zones):
 * - FLIP IT: score >= 7.0
 * - CAUTIOUS: 4.5 <= score < 7.0
 * - SKIP: score < 4.5
 *
 * Track zones (visual thirds under the bar): ~0–3.3 Skip, ~3.3–6.7 Maybe, ~6.7–10 Flip It.
 */

export interface FlipScoreBreakdownUI {
  velocity: number;
  margin: number;
  supply_gap: number;
  brand_tier: number;
  price_stability: number;
  weights?: {
    velocity: number;
    margin: number;
    supply_gap: number;
    brand_tier: number;
    price_stability: number;
  };
  labels?: Record<string, string>;
}

export interface FlipScoreMeterProps {
  score: number;
  breakdown: FlipScoreBreakdownUI;
  soldVelocity: { d7: number; d30: number };
}

function verdictForScore(score: number): { label: string; sub: string; barClass: string } {
  if (score >= 7) return { label: 'FLIP IT', sub: 'Strong data-backed signal', barClass: 'from-emerald-500 to-emerald-400' };
  if (score >= 4.5) return { label: 'CAUTIOUS', sub: 'Mixed signals — dig deeper', barClass: 'from-amber-500 to-amber-400' };
  return { label: 'SKIP', sub: 'Weak flip profile right now', barClass: 'from-rose-500 to-rose-400' };
}

function glowForScore(score: number): string {
  if (score >= 7) return 'shadow-[0_0_14px_rgba(16,185,129,0.85)]';
  if (score >= 4.5) return 'shadow-[0_0_14px_rgba(245,158,11,0.75)]';
  return 'shadow-[0_0_14px_rgba(244,63,94,0.75)]';
}

function dotColor(score: number): string {
  if (score >= 7) return 'bg-emerald-500';
  if (score >= 4.5) return 'bg-amber-500';
  return 'bg-rose-500';
}

const SIGNAL_META: { key: keyof FlipScoreBreakdownUI; label: string }[] = [
  { key: 'velocity', label: 'Velocity' },
  { key: 'margin', label: 'Margin' },
  { key: 'supply_gap', label: 'Supply gap' },
  { key: 'brand_tier', label: 'Brand tier' },
  { key: 'price_stability', label: 'Price stability' },
];

export default function FlipScoreMeter({ score, breakdown, soldVelocity }: FlipScoreMeterProps) {
  const clamped = Math.min(10, Math.max(0, score));
  const pct = (clamped / 10) * 100;
  const v = verdictForScore(clamped);

  return (
    <div className="rounded-2xl border border-gray-100 bg-gradient-to-b from-gray-50/80 to-white px-4 py-4 space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
        <div>
          <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Flip score</p>
          <div className="flex items-baseline gap-2 mt-1">
            <span
              className={`inline-flex items-center rounded-xl px-3 py-1.5 text-lg sm:text-xl font-black tracking-tight bg-gradient-to-r ${v.barClass} text-white shadow-md`}
            >
              {v.label}
            </span>
          </div>
          <p className="text-[11px] text-gray-500 mt-1.5">{v.sub}</p>
        </div>
        <div className="text-right sm:pt-5">
          <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Numeric</p>
          <p className="text-2xl font-black text-gray-900 tabular-nums">{clamped.toFixed(1)}</p>
          <p className="text-[10px] text-gray-400">/ 10</p>
        </div>
      </div>

      <div className="space-y-1.5">
        <div className="relative h-3 rounded-full bg-gradient-to-r from-rose-100 via-amber-100 to-emerald-100 border border-gray-200/80 overflow-visible">
          <div
            className="absolute top-1/2 -translate-y-1/2 z-10 w-4 h-4 rounded-full border-2 border-white transition-all duration-700 ease-out"
            style={{ left: `calc(${pct}% - 8px)` }}
            title={`Score ${clamped.toFixed(1)}`}
          >
            <span
              className={`absolute inset-0 rounded-full ${dotColor(clamped)} ${glowForScore(clamped)} transition-shadow duration-500`}
            />
          </div>
        </div>
        <div className="flex justify-between text-[9px] font-bold text-gray-400 uppercase tracking-wide px-0.5">
          <span className="w-1/3 text-left text-rose-600/90">Skip</span>
          <span className="w-1/3 text-center text-amber-700/90">Maybe</span>
          <span className="w-1/3 text-right text-emerald-700/90">Flip it</span>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        <span className="text-[11px] font-semibold rounded-full bg-white border border-gray-200 px-3 py-1 text-gray-800">
          {soldVelocity.d7} sold in 7 days
        </span>
        <span className="text-[11px] font-semibold rounded-full bg-white border border-gray-200 px-3 py-1 text-gray-800">
          {soldVelocity.d30} sold in 30 days
        </span>
      </div>

      <div className="space-y-2.5 pt-1 border-t border-gray-100">
        <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Signal mix (0–10 each)</p>
        {SIGNAL_META.map(({ key, label }) => {
          const val = typeof breakdown[key] === 'number' ? (breakdown[key] as number) : 0;
          const w = breakdown.weights?.[key as keyof NonNullable<FlipScoreBreakdownUI['weights']>];
          const weightPct = w != null ? Math.round(w * 100) : null;
          const tip = breakdown.labels?.[key];
          return (
            <div key={key} className="space-y-1">
              <div className="flex justify-between gap-2 text-[11px]">
                <span className="font-semibold text-gray-700 truncate" title={tip}>
                  {label}
                  {weightPct != null ? (
                    <span className="text-gray-400 font-medium ml-1">({weightPct}%)</span>
                  ) : null}
                </span>
                <span className="font-black text-gray-900 tabular-nums flex-shrink-0">{val.toFixed(1)}</span>
              </div>
              <div className="h-1.5 rounded-full bg-gray-100 overflow-hidden">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-gray-700 to-gray-900 transition-all duration-700 ease-out"
                  style={{ width: `${Math.min(100, Math.max(0, val * 10))}%` }}
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
