/** Columns on `public.scans` used by dashboard / history / after-scan flows (extends over time). */
export interface ScanOutcomeColumns {
  bought_at: string | null;
  bought_price_gbp: number | null;
  sold_at: string | null;
  sold_price_gbp: number | null;
}

export interface ScanWatchlistRow {
  id: string;
  user_id: string;
  scan_id: string;
  baseline_resale_gbp: number;
  created_at: string;
  checked_at: string | null;
}

export type ScanRowWithOutcomes = ScanOutcomeColumns & {
  id: string;
  user_id?: string;
  created_at?: string;
  brand_name?: string;
  expected_resale_gbp?: number | null;
  buy_price_gbp?: number | null;
  profit_gbp?: number | null;
  roi?: number | null;
};
