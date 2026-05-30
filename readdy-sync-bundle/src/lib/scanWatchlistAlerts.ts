import type { SupabaseClient } from '@supabase/supabase-js';
import { WATCHLIST_DURATION_MS } from './watchlistConstants';
import { WATCHLIST_RESALE_MOVE_THRESHOLD } from './scanProfit';

type WatchRow = {
  id: string;
  scan_id: string;
  baseline_resale_gbp: number | string;
  created_at: string;
  scans: { expected_resale_gbp: number | null; brand_name?: string | null } | null;
};

/**
 * For active 48h watchlist rows, compare latest scan resale to baseline; toast once per session per
 * (scan, baseline, current) triple; updates `checked_at` for audit.
 */
export async function runWatchlistResaleAlerts(args: {
  supabase: SupabaseClient;
  userId: string;
  showToast: (message: string, type?: 'success' | 'error' | 'info') => void;
}): Promise<void> {
  const { supabase, userId, showToast } = args;
  const now = Date.now();

  const { data, error } = await supabase
    .from('scan_watchlist')
    .select('id, scan_id, baseline_resale_gbp, created_at, scans(expected_resale_gbp, brand_name)')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(80);

  if (error || !data?.length) return;

  for (const raw of data as WatchRow[]) {
    const created = new Date(raw.created_at).getTime();
    if (now > created + WATCHLIST_DURATION_MS) continue;

    const scan = Array.isArray(raw.scans) ? raw.scans[0] : raw.scans;
    const current =
      scan?.expected_resale_gbp != null && !Number.isNaN(Number(scan.expected_resale_gbp))
        ? Number(scan.expected_resale_gbp)
        : null;
    const baseline = Number(raw.baseline_resale_gbp);
    if (current == null || baseline <= 0) continue;

    const pct = (current - baseline) / baseline;
    if (Math.abs(pct) < WATCHLIST_RESALE_MOVE_THRESHOLD) continue;

    const key = `marginn_watch_move_${raw.scan_id}_${Math.round(baseline)}_${Math.round(current)}`;
    if (typeof sessionStorage !== 'undefined' && sessionStorage.getItem(key)) continue;
    if (typeof sessionStorage !== 'undefined') sessionStorage.setItem(key, '1');

    const brand = String(scan?.brand_name ?? '').trim() || 'This item';
    showToast(
      `Watched resale moved ${(pct * 100).toFixed(0)}% for ${brand}: was £${Math.round(baseline)}, now £${Math.round(current)}.`,
      'info'
    );

    await supabase.from('scan_watchlist').update({ checked_at: new Date().toISOString() }).eq('id', raw.id);
  }
}
