import type { ScanRowWithOutcomes } from '../types/scans';

/** Relative move vs baseline to surface a resale watch toast (5%). */
export const WATCHLIST_RESALE_MOVE_THRESHOLD = 0.05;

export interface ProfitBreakdown {
  /** Legacy sum of modelled `profit_gbp` on scans without outcome tracking. */
  estimatedOnlySum: number;
  /** Items marked sold: sold_price − cost (bought_price or buy_price). */
  realizedSum: number;
  /** Bought but not sold: use stored modelled profit when present. */
  pipelineSum: number;
  /** What we show as “total profit tracked” on the dashboard. */
  totalTracked: number;
}

function costGbp(row: ScanRowWithOutcomes): number {
  const bought = row.bought_price_gbp != null ? Number(row.bought_price_gbp) : null;
  const estBuy = row.buy_price_gbp != null ? Number(row.buy_price_gbp) : null;
  return bought ?? estBuy ?? 0;
}

export function computeProfitBreakdown(rows: ScanRowWithOutcomes[]): ProfitBreakdown {
  let estimatedOnlySum = 0;
  let realizedSum = 0;
  let pipelineSum = 0;

  for (const row of rows) {
    const profitGbp = Number(row.profit_gbp) || 0;
    const sold = row.sold_at && row.sold_price_gbp != null;
    const bought = Boolean(row.bought_at);

    if (sold) {
      const sale = Number(row.sold_price_gbp);
      const cost = costGbp(row);
      realizedSum += sale - cost;
      continue;
    }

    if (bought) {
      pipelineSum += profitGbp;
      continue;
    }

    estimatedOnlySum += profitGbp;
  }

  return {
    estimatedOnlySum,
    realizedSum,
    pipelineSum,
    totalTracked: estimatedOnlySum + realizedSum + pipelineSum,
  };
}
