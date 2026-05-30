import { jsonResponse } from "./cors.ts";

export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

export const ALLOWED_IMAGE_MIMES = ["image/jpeg", "image/png", "image/webp"] as const;
export type AllowedImageMime = (typeof ALLOWED_IMAGE_MIMES)[number];

const MIME_SET = new Set<string>(ALLOWED_IMAGE_MIMES);

export interface ValidatedScanImage {
  cleanBase64: string;
  mimeType: AllowedImageMime;
  decodedByteLength: number;
}

/** Conservative upper bound on decoded bytes from base64 length (ignores whitespace). */
export function impliedDecodedBytesUpperBound(base64NoWs: string): number {
  const n = base64NoWs.length;
  if (n === 0) return 0;
  const padding = base64NoWs.endsWith("==") ? 2 : base64NoWs.endsWith("=") ? 1 : 0;
  return Math.floor((n * 3) / 4) - padding;
}

/**
 * From raw `imageBase64` / `image_base64` field: strip `data:*;base64,` if present.
 * Uses index-based parsing so very large payloads are not scanned by a global regex.
 */
export function splitDataUrlBase64(raw: string): { payload: string; dataUrlMime: string | null } {
  const trimmed = raw.trim();
  if (trimmed.toLowerCase().startsWith("data:")) {
    const sep = trimmed.indexOf(";base64,");
    if (sep !== -1) {
      const mimePart = trimmed.slice(5, sep).trim().toLowerCase();
      const payload = trimmed.slice(sep + ";base64,".length);
      return { payload, dataUrlMime: mimePart || null };
    }
  }
  return { payload: trimmed, dataUrlMime: null };
}

function normalizeMime(m: string | undefined | null): string | null {
  if (m === undefined || m === null) return null;
  const t = String(m).trim().toLowerCase();
  if (t === "image/jpg") return "image/jpeg";
  return t || null;
}

function resolveMime(dataUrlMime: string | null, bodyMime: string | undefined | null): string | null {
  return normalizeMime(dataUrlMime ?? bodyMime) ?? normalizeMime(bodyMime ?? undefined);
}

function isValidBase64Chars(s: string): boolean {
  const noWs = s.replace(/\s/g, "");
  if (noWs.length === 0) return false;
  return /^[A-Za-z0-9+/]+=*$/.test(noWs);
}

/**
 * Validates size (≤ 5MB decoded), MIME (jpeg/png/webp), and base64 shape.
 * Returns a Response on failure (caller should return it).
 */
export function validateScanImageInput(
  req: Request,
  imageField: string,
  bodyMime: string | undefined | null,
): ValidatedScanImage | Response {
  const { payload, dataUrlMime } = splitDataUrlBase64(imageField);
  const cleanBase64 = payload.replace(/\s/g, "");
  const implied = impliedDecodedBytesUpperBound(cleanBase64);
  if (implied > MAX_IMAGE_BYTES) {
    return jsonResponse(
      req,
      {
        error: "Image too large",
        message: `Decoded image would exceed ${MAX_IMAGE_BYTES} bytes (limit is 5MB).`,
      },
      413,
    );
  }

  if (!isValidBase64Chars(cleanBase64)) {
    return jsonResponse(req, { error: "Invalid image data", message: "Payload is not valid base64." }, 400);
  }

  let decoded: Uint8Array;
  try {
    const bin = atob(cleanBase64);
    decoded = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) decoded[i] = bin.charCodeAt(i);
  } catch {
    return jsonResponse(req, { error: "Invalid image data", message: "Base64 decode failed." }, 400);
  }

  if (decoded.byteLength > MAX_IMAGE_BYTES) {
    return jsonResponse(
      req,
      {
        error: "Image too large",
        message: `Decoded image is ${decoded.byteLength} bytes; maximum is ${MAX_IMAGE_BYTES} bytes (5MB).`,
      },
      413,
    );
  }

  const mime = resolveMime(dataUrlMime, bodyMime);
  if (!mime || !MIME_SET.has(mime)) {
    return jsonResponse(
      req,
      {
        error: "Unsupported image type",
        message: "Only image/jpeg, image/png, and image/webp are allowed.",
      },
      400,
    );
  }

  return {
    cleanBase64,
    mimeType: mime as AllowedImageMime,
    decodedByteLength: decoded.byteLength,
  };
}
