/**
 * Scan image fingerprint + identification payload shape for `scan_identification_cache`.
 * Pricing / comps are never cached here — only vision-equivalent structured fields.
 */

export const IDENT_CACHE_SCHEMA_VERSION = 1;
export const IDENT_CACHE_TTL_MS = 48 * 60 * 60 * 1000;

/** Keys aligned with Anthropic vision JSON (stored in `payload` jsonb). */
export const IDENTIFICATION_PAYLOAD_KEYS = [
  "brand_name",
  "sub_brand",
  "brand_confidence",
  "condition_grade",
  "item_type_bucket",
  "trend_score",
  "colour",
  "gender",
  "item_type",
  "style",
  "category",
  "era",
] as const;

export type IdentificationPayloadKey = (typeof IDENTIFICATION_PAYLOAD_KEYS)[number];

/** SHA-256 hex of UTF-8 bytes of the base64 image string (after stripping data-URL prefix). Matches Edge + client if both use the same string. */
export async function fingerprintFromScanBase64(cleanBase64: string): Promise<string> {
  const enc = new TextEncoder().encode(cleanBase64);
  const hash = await crypto.subtle.digest("SHA-256", enc);
  return Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export function pickIdentificationPayload(ai: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const k of IDENTIFICATION_PAYLOAD_KEYS) {
    if (k in ai && ai[k] !== undefined) out[k] = ai[k];
  }
  return out;
}

/** True if cached payload has enough signal to skip vision (at least one non-empty identification field). */
export function isIdentificationPayloadUsable(payload: Record<string, unknown>): boolean {
  for (const k of IDENTIFICATION_PAYLOAD_KEYS) {
    const v = payload[k];
    if (v === undefined || v === null) continue;
    if (typeof v === "string" && v.trim() === "") continue;
    if (typeof v === "number" && !Number.isFinite(v)) continue;
    return true;
  }
  return false;
}

export function mergeIdentificationFromCache(
  payload: Record<string, unknown>,
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const k of IDENTIFICATION_PAYLOAD_KEYS) {
    if (k in payload) out[k] = payload[k];
  }
  return out;
}
