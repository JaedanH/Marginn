/** Payload from Edge `authenticate-item` (Claude forensic auth). */
export type ForensicAuthVerdict = 'AUTHENTIC' | 'SUSPICIOUS' | 'UNVERIFIABLE';

export interface ForensicAuthentication {
  verdict: ForensicAuthVerdict;
  confidence: number;
  evidence: string[];
  risk_flags: string[];
  authentication_notes: string;
  brand_confirmed: boolean;
  recommend_physical_check: boolean;
  recommend_physical_check_reason: string;
}

import { edgeFunctionAuthHeaders } from '@/supabaseClient';
import { supabaseFunctionUrl } from './supabaseFunctions';
import type { EncodedScanImage } from './scanEdgeResponse';
import type { Session } from '@supabase/supabase-js';

const AUTHENTICATE_FN_URL = supabaseFunctionUrl('authenticate-item');

export async function fetchForensicAuthentication(args: {
  session: Session | null;
  encoded: EncodedScanImage;
  brandName: string;
  itemType: string;
  userId: string;
  scanId?: string;
}): Promise<{
  authentication: ForensicAuthentication;
  authentication_score: number;
  authentication_verdict: string;
} | null> {
  const { session, encoded, brandName, itemType, userId, scanId } = args;
  try {
    const res = await fetch(AUTHENTICATE_FN_URL, {
      method: 'POST',
      headers: await edgeFunctionAuthHeaders({ session }),
      body: JSON.stringify({
        image_base64: `data:${encoded.mimeType};base64,${encoded.base64}`,
        mimeType: encoded.mimeType,
        brandName,
        itemType,
        userId,
        ...(scanId ? { scan_id: scanId } : {}),
      }),
    });
    if (!res.ok) {
      console.warn('[authenticate-item]', res.status, await res.text().catch(() => ''));
      return null;
    }
    const data = (await res.json()) as {
      authentication?: unknown;
      authentication_score?: number;
      authentication_verdict?: string;
    };
    const authentication = parseForensicAuthentication(data.authentication);
    if (!authentication) return null;
    return {
      authentication,
      authentication_score:
        typeof data.authentication_score === 'number'
          ? data.authentication_score
          : Math.round(authentication.confidence * 100),
      authentication_verdict:
        typeof data.authentication_verdict === 'string'
          ? data.authentication_verdict
          : authentication.verdict,
    };
  } catch (e) {
    console.warn('[authenticate-item] request failed', e);
    return null;
  }
}

export function parseForensicAuthentication(raw: unknown): ForensicAuthentication | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const o = raw as Record<string, unknown>;
  const verdictRaw = String(o.verdict ?? 'UNVERIFIABLE').toUpperCase();
  const verdict: ForensicAuthVerdict =
    verdictRaw === 'AUTHENTIC' || verdictRaw === 'SUSPICIOUS' ? verdictRaw : 'UNVERIFIABLE';
  return {
    verdict,
    confidence: Math.min(1, Math.max(0, Number(o.confidence) || 0)),
    evidence: Array.isArray(o.evidence)
      ? o.evidence.map((e) => String(e)).filter(Boolean).slice(0, 6)
      : [],
    risk_flags: Array.isArray(o.risk_flags)
      ? o.risk_flags.map((e) => String(e)).filter(Boolean).slice(0, 6)
      : [],
    authentication_notes: String(o.authentication_notes ?? '').slice(0, 500),
    brand_confirmed: Boolean(o.brand_confirmed),
    recommend_physical_check: Boolean(o.recommend_physical_check),
    recommend_physical_check_reason: String(o.recommend_physical_check_reason ?? '').slice(0, 300),
  };
}
