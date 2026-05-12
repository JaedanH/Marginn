/** Root payload from `analyse-item` (JSON body or NDJSON `complete.data`). */
export interface AnalyseItemCompletePayload {
  fingerprint?: string;
  scanId?: string;
  scan_id?: string;
  /** Edge-reported outcome of inserting into `public.scans` (debug + client fallback). */
  scanPersist?: {
    ok: boolean;
    skipped?: boolean;
    reason?: string;
    error?: { code: string; message: string };
  };
  imageUrl?: string;
  searchQuery?: string;
  margin?: AnalyseItemMargin;
  decision?: string;
  ai?: Record<string, unknown>;
  brand?: Record<string, unknown> | null;
  livePrices?: Record<string, unknown>;
  /** True when identification came from `scan_identification_cache` (vision skipped). */
  identification_from_cache?: boolean;
  /** Flat shape (alternate clients) */
  brand_name?: string;
}

/** Economics payload returned by `analyse-item` (JSON + NDJSON `complete` event). */
export interface AnalyseItemMargin {
  resale_gbp: number;
  platform_fee_rate: number;
  platform_fee_gbp: number;
  shipping_gbp: number;
  margin_buffer_gbp: number;
  buy_price_gbp: number | null;
  net_profit_gbp: number | null;
  max_buy_price_gbp: number;
  roi_percent: number | null;
}

/** Long edge aligned with Anthropic vision cap for non-Opus models (~1568px). */
const DEFAULT_MAX_LONG_EDGE = 1568;
const JPEG_QUALITY = 0.88;

export interface EncodedScanImage {
  base64: string;
  mimeType: string;
}

/**
 * Downscale and re-encode as JPEG for faster uploads to the Edge Function
 * while keeping tags/logos readable.
 */
export async function encodeImageForScan(
  file: File,
  maxLongEdge: number = DEFAULT_MAX_LONG_EDGE
): Promise<EncodedScanImage> {
  try {
    const bitmap = await createImageBitmap(file);
    const w = bitmap.width;
    const h = bitmap.height;
    const scale = Math.min(1, maxLongEdge / Math.max(w, h));
    const tw = Math.max(1, Math.round(w * scale));
    const th = Math.max(1, Math.round(h * scale));
    const canvas = document.createElement("canvas");
    canvas.width = tw;
    canvas.height = th;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("no canvas context");
    ctx.drawImage(bitmap, 0, 0, tw, th);
    bitmap.close();
    const dataUrl = canvas.toDataURL("image/jpeg", JPEG_QUALITY);
    const comma = dataUrl.indexOf(",");
    const base64 = comma >= 0 ? dataUrl.slice(comma + 1) : dataUrl;
    return { base64, mimeType: "image/jpeg" };
  } catch {
    const buf = await file.arrayBuffer();
    let binary = "";
    const bytes = new Uint8Array(buf);
    const chunk = 0x8000;
    for (let i = 0; i < bytes.length; i += chunk) {
      binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
    }
    const base64 = btoa(binary);
    const mimeType = file.type && file.type.startsWith("image/") ? file.type : "image/jpeg";
    return { base64, mimeType };
  }
}

/**
 * Read NDJSON lines from analyse-item when `stream: true` was sent.
 * Calls `onAnalysis` when the first `analysis` event arrives (for UI progress).
 */
export async function readNdjsonScanResponse(
  res: Response,
  onAnalysis?: () => void
): Promise<Record<string, unknown>> {
  if (!res.body) throw new Error("No response body");
  const reader = res.body.getReader();
  const dec = new TextDecoder();
  let buf = "";
  let complete: Record<string, unknown> | null = null;
  for (;;) {
    const { done, value } = await reader.read();
    buf += dec.decode(value ?? new Uint8Array(), { stream: !done });
    const lines = buf.split("\n");
    buf = lines.pop() ?? "";
    for (const line of lines) {
      if (!line.trim()) continue;
      const obj = JSON.parse(line) as {
        event?: string;
        data?: Record<string, unknown>;
        message?: string;
      };
      if (obj.event === "analysis") onAnalysis?.();
      if (obj.event === "error") throw new Error(obj.message ?? "Scan stream failed");
      if (obj.event === "complete" && obj.data) complete = obj.data;
    }
    if (done) break;
  }
  // Flush a final line that arrived without a trailing newline in the last chunk
  const tail = buf.trim();
  if (tail) {
    const obj = JSON.parse(tail) as {
      event?: string;
      data?: Record<string, unknown>;
      message?: string;
    };
    if (obj.event === "error") throw new Error(obj.message ?? "Scan stream failed");
    if (obj.event === "complete" && obj.data) complete = obj.data;
  }
  if (!complete) throw new Error("Scan stream missing complete payload");
  return complete;
}
