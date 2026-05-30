import { supabase } from '@/supabaseClient';
import type { AnalyseItemCompletePayload } from './scanEdgeResponse';
import { isResaleDisplaySuppressed } from './scanEconomics';

export type ScanPersistOutcome =
  | { ok: true; source: 'existing' | 'edge' | 'client_upsert' }
  | { ok: false; reason: string; code?: string; message?: string };

/**
 * Guarantees a `public.scans` row exists for this scan id and signed-in user.
 * Edge may insert with service role; client verifies with RLS and upserts if missing.
 */
export async function ensureScanPersisted(opts: {
  scanId: string;
  userId: string;
  result: {
    brand: string;
    verdict?: 'BUY' | 'MAYBE' | 'SKIP';
    resaleValue?: number;
  };
  responseData: Record<string, unknown>;
  scanMode: string;
  buyPriceNum: number;
  imageUrl: string | null;
  partnerShopId?: string | null;
  edgePersist?: AnalyseItemCompletePayload['scanPersist'];
}): Promise<ScanPersistOutcome> {
  const { scanId, userId, result, responseData, scanMode, buyPriceNum, imageUrl, partnerShopId, edgePersist } =
    opts;

  const { data: existingRow, error: selectErr } = await supabase
    .from('scans')
    .select('id')
    .eq('id', scanId)
    .eq('user_id', userId)
    .maybeSingle();

  if (selectErr) {
    console.error('[ensureScanPersisted] SELECT failed:', selectErr);
  }
  if (existingRow?.id) {
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('marginn:scan-saved', { detail: { scanId, userId } }));
    }
    return { ok: true, source: 'existing' };
  }

  if (edgePersist?.ok === true) {
    console.warn(
      '[ensureScanPersisted] Edge reported insert OK but row not visible — retrying client upsert (RLS/user_id?)',
      { scanId, userId: userId.slice(0, 8) },
    );
  }

  const ai =
    responseData.brand_name !== undefined
      ? responseData
      : ((responseData as { ai?: Record<string, unknown> }).ai ?? {});
  const suppressed = isResaleDisplaySuppressed(responseData);
  const margin = responseData.margin as { resale_gbp?: number; net_profit_gbp?: number | null } | undefined;
  const resaleVal = suppressed
    ? null
    : typeof margin?.resale_gbp === 'number' && margin.resale_gbp > 0
      ? Math.round(margin.resale_gbp)
      : typeof responseData.resale_price === 'number' && responseData.resale_price > 0
        ? Math.round(responseData.resale_price as number)
        : result.resaleValue && result.resaleValue > 0
          ? result.resaleValue
          : null;

  const netProfit =
    typeof margin?.net_profit_gbp === 'number'
      ? margin.net_profit_gbp
      : buyPriceNum > 0 && resaleVal != null
        ? Math.round(resaleVal - buyPriceNum - resaleVal * 0.12 - 4)
        : null;

  const roi =
    buyPriceNum > 0 && resaleVal != null
      ? Math.round(((resaleVal - buyPriceNum) / buyPriceNum) * 100)
      : null;

  const flipPayload = responseData as AnalyseItemCompletePayload;
  const row: Record<string, unknown> = {
    id: scanId,
    user_id: userId,
    brand_name: result.brand || 'Unknown Brand',
    brand_confidence: Number(ai.brand_confidence) || 0,
    item_type_bucket: String(ai.item_type_bucket ?? 'MED'),
    condition_grade: String(ai.condition_grade ?? 'GOOD'),
    trend_score: Number(ai.trend_score) || 5,
    buy_price_gbp: buyPriceNum > 0 ? buyPriceNum : null,
    expected_resale_gbp: resaleVal,
    resale_adj_gbp: resaleVal,
    net_gbp: netProfit,
    profit_gbp: netProfit,
    roi,
    mode: scanMode.toUpperCase(),
    platform: 'web',
    decision: result.verdict ?? 'MAYBE',
    image_url: imageUrl,
  };

  if (typeof flipPayload.flip_score === 'number') {
    row.flip_score = flipPayload.flip_score;
    row.flip_score_breakdown = flipPayload.flip_score_breakdown ?? null;
  }
  if (typeof flipPayload.m_score === 'number') {
    row.m_score = flipPayload.m_score;
    row.m_score_breakdown = flipPayload.m_score_breakdown ?? null;
  }
  if (partnerShopId) row.partner_shop_id = partnerShopId;

  const { error: upsertErr } = await supabase.from('scans').upsert(row, { onConflict: 'id' });

  if (upsertErr) {
    console.error('[ensureScanPersisted] upsert FAILED:', {
      code: upsertErr.code,
      message: upsertErr.message,
      details: upsertErr.details,
      hint: upsertErr.hint,
    });
    return {
      ok: false,
      reason: 'client_upsert_failed',
      code: upsertErr.code,
      message: upsertErr.message,
    };
  }

  console.log('[ensureScanPersisted] client upsert ok', scanId);
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('marginn:scan-saved', { detail: { scanId, userId } }));
  }
  return { ok: true, source: 'client_upsert' };
}
