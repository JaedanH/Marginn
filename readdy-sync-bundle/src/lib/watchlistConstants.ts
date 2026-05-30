/** Watchlist window from `scan_watchlist.created_at` (matches product copy). */
export const WATCHLIST_DURATION_MS = 48 * 60 * 60 * 1000;

export function watchlistUntilIso(createdAt: string): string {
  const t = new Date(createdAt).getTime();
  return new Date(t + WATCHLIST_DURATION_MS).toISOString();
}
