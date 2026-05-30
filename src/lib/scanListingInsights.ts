export interface ListingPriceDay {
  price_gbp: number | null;
  days_ago: number | null;
}

function median(nums: number[]): number {
  if (nums.length === 0) return 0;
  const sorted = [...nums].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 !== 0
    ? sorted[mid]
    : Math.round((sorted[mid - 1] + sorted[mid]) / 2);
}

const MIN_SAMPLES_PER_BUCKET = 4;

/**
 * Recent ≈ sold within last 30 days (small days_ago); older ≈ 31–120 days ago.
 * Requires enough dated comps in each bucket; otherwise insufficient.
 */
export function ebayPriceTrendFromListings(
  listings: ListingPriceDay[],
  /** Optional Edge `ebay_price_trend_pct` when client buckets are thin */
  serverPct?: number | null
):
  | { status: 'trend'; direction: 'up' | 'down'; pct: number }
  | { status: 'insufficient' } {
  const dated = listings.filter(
    (l) => l.days_ago != null && l.price_gbp != null && l.price_gbp! > 0
  ) as { days_ago: number; price_gbp: number }[];

  const recentPrices = dated.filter((l) => l.days_ago <= 30).map((l) => l.price_gbp);
  const olderPrices = dated.filter((l) => l.days_ago > 30 && l.days_ago <= 120).map((l) => l.price_gbp);

  if (recentPrices.length >= MIN_SAMPLES_PER_BUCKET && olderPrices.length >= MIN_SAMPLES_PER_BUCKET) {
    const mr = median(recentPrices);
    const mo = median(olderPrices);
    if (mo > 0) {
      const rawPct = ((mr - mo) / mo) * 100;
      if (Number.isFinite(rawPct) && Math.abs(rawPct) >= 2) {
        return {
          status: 'trend',
          direction: rawPct >= 0 ? 'up' : 'down',
          pct: Math.round(Math.abs(rawPct)),
        };
      }
    }
  }

  if (serverPct != null && Number.isFinite(serverPct) && Math.abs(serverPct) >= 1) {
    return {
      status: 'trend',
      direction: serverPct >= 0 ? 'up' : 'down',
      pct: Math.round(Math.abs(serverPct)),
    };
  }

  return { status: 'insufficient' };
}

export function timeToSellBandDays(daysList: (number | null)[]): { low: number; high: number } | null {
  const valid = daysList.filter((d): d is number => d !== null && d >= 0 && d < 400);
  if (valid.length < 5) return null;
  const sorted = [...valid].sort((a, b) => a - b);
  const q = (p: number) => sorted[Math.min(sorted.length - 1, Math.floor(p * (sorted.length - 1)))];
  const q1 = q(0.25);
  const q3 = q(0.75);
  const low = Math.max(1, Math.round(q1));
  const high = Math.max(low, Math.round(q3));
  return { low, high };
}
