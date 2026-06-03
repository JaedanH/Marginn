/**
 * Structured scan pipeline diagnostics for analyse-item.
 * E-* = Marginn/system issue; U-* = user photo/data quality (no scary error codes in UI).
 */
import { jsonResponse } from "./cors.ts";

export type PipelineIssueCategory = "none" | "user" | "system";

export type PipelineStageStatus = {
  status: "ok" | "skipped" | "warn" | "failed";
  code?: string | null;
  detail?: string | null;
};

export type PipelineReport = {
  pipeline_status: "ok" | "partial" | "failed";
  issue_category: PipelineIssueCategory;
  /** E-* system fault, U-* user/data quality, null when fully ok */
  primary_code: string | null;
  user_message: string;
  stages: Record<string, PipelineStageStatus>;
  warnings?: string[];
};

export const PIPELINE_USER_MESSAGE_MANUAL_BROWSE =
  "Limited data — browse manually";

export const PIPELINE_USER_MESSAGE_PHOTO_QUALITY =
  "We couldn't read this item clearly enough from the photo. Try a brighter, closer shot of the brand label, then scan again.";

/** System error codes (shown to user with E- prefix). */
export const E = {
  INVALID_BODY: "E-INVALID-BODY",
  VALIDATION: "E-VALIDATION",
  NO_IMAGE: "E-NO-IMAGE",
  IMAGE_TOO_LARGE: "E-IMAGE-TOO-LARGE",
  IMAGE_INVALID: "E-IMAGE-INVALID",
  IMAGE_UNSUPPORTED: "E-IMAGE-UNSUPPORTED",
  RATE_LIMIT: "E-RATE-LIMIT",
  RATE_LIMIT_CHECK: "E-RATE-LIMIT-CHECK",
  ANTHROPIC: "E-ANTHROPIC",
  AI_PARSE: "E-AI-PARSE",
  IMGBB: "E-IMGBB",
  SCRAPINGBEE: "E-SCRAPINGBEE",
  MARKET_SCRAPE: "E-MARKET-SCRAPE",
  SUPABASE_CONFIG: "E-SUPABASE-CONFIG",
  SCAN_PERSIST: "E-SCAN-PERSIST",
  PARTNER_SHOP: "E-PARTNER-SHOP",
  INTERNAL: "E-INTERNAL",
  STREAM: "E-STREAM",
} as const;

/** User/data quality codes (not shown as E- errors). */
export const U = {
  INSUFFICIENT_COMPS: "U-INSUFFICIENT-COMPS",
  LOW_BRAND_CONFIDENCE: "U-LOW-BRAND-CONFIDENCE",
  UNKNOWN_BRAND: "U-UNKNOWN-BRAND",
} as const;

const SYSTEM_MESSAGES: Record<string, string> = {
  [E.INVALID_BODY]: "We couldn't read your request. Please try scanning again.",
  [E.VALIDATION]: "Something in the scan request wasn't valid. Please try again.",
  [E.NO_IMAGE]: "No photo was attached. Add a clear photo and try again.",
  [E.IMAGE_TOO_LARGE]: "That photo is too large. Use a smaller image (under 5MB) and try again.",
  [E.IMAGE_INVALID]: "That photo couldn't be processed. Try another image.",
  [E.IMAGE_UNSUPPORTED]: "That file type isn't supported. Use JPEG, PNG, or WebP.",
  [E.RATE_LIMIT]: "You're scanning quickly — please wait a moment and try again.",
  [E.RATE_LIMIT_CHECK]: "We couldn't verify your scan allowance. Please try again shortly.",
  [E.ANTHROPIC]: "Our item recognition service is temporarily unavailable (E-ANTHROPIC). Please try again in a few minutes.",
  [E.AI_PARSE]: "We received a response we couldn't interpret (E-AI-PARSE). Please try again.",
  [E.IMGBB]: "We couldn't store your scan image (E-IMGBB). The scan may still work — try again if results look wrong.",
  [E.SCRAPINGBEE]: "Live marketplace pricing is temporarily unavailable (E-SCRAPINGBEE).",
  [E.MARKET_SCRAPE]: "We couldn't fetch live sold listings (E-MARKET-SCRAPE).",
  [E.SUPABASE_CONFIG]: "Scan history isn't configured on the server (E-SUPABASE-CONFIG). Contact support if this persists.",
  [E.SCAN_PERSIST]: "Your result couldn't be saved to history (E-SCAN-PERSIST). You can still use this scan.",
  [E.PARTNER_SHOP]: "That partner shop link isn't valid for your account (E-PARTNER-SHOP).",
  [E.INTERNAL]: "Something went wrong on our side (E-INTERNAL). Please try again.",
  [E.STREAM]: "The scan stream was interrupted (E-STREAM). Please try again.",
};

export function systemMessageForCode(code: string): string {
  return SYSTEM_MESSAGES[code] ?? `Something went wrong on our side (${code}). Please try again.`;
}

export function emptyStages(): Record<string, PipelineStageStatus> {
  return {
    request: { status: "ok" },
    image: { status: "ok" },
    rate_limit: { status: "ok" },
    vision: { status: "ok" },
    ebay_scrape: { status: "ok" },
    pricing: { status: "ok" },
    scan_persist: { status: "ok" },
  };
}

export function buildFailedReport(
  code: string,
  stages?: Record<string, PipelineStageStatus>,
  warnings?: string[],
): PipelineReport {
  return {
    pipeline_status: "failed",
    issue_category: "system",
    primary_code: code,
    user_message: systemMessageForCode(code),
    stages: { ...emptyStages(), ...stages },
    warnings,
  };
}

export function buildPartialReport(opts: {
  primary_code: string | null;
  issue_category: PipelineIssueCategory;
  user_message: string;
  stages: Record<string, PipelineStageStatus>;
  warnings?: string[];
}): PipelineReport {
  return {
    pipeline_status: "partial",
    issue_category: opts.issue_category,
    primary_code: opts.primary_code,
    user_message: opts.user_message,
    stages: { ...emptyStages(), ...opts.stages },
    warnings: opts.warnings,
  };
}

export function buildOkReport(
  stages: Record<string, PipelineStageStatus>,
  warnings?: string[],
): PipelineReport {
  return {
    pipeline_status: "ok",
    issue_category: "none",
    primary_code: null,
    user_message: "Scan completed successfully.",
    stages: { ...emptyStages(), ...stages },
    warnings,
  };
}

export function pipelineJsonError(
  req: Request,
  code: string,
  error: string,
  status: number,
  stages?: Record<string, PipelineStageStatus>,
  extra?: Record<string, unknown>,
): Response {
  const report = buildFailedReport(code, stages);
  return jsonResponse(
    req,
    {
      error,
      message: report.user_message,
      pipeline_report: report,
      error_code: code,
      ...extra,
    },
    status,
  );
}

/** Wrap an existing error JSON body (e.g. image validation) with pipeline_report. */
export function pipelineErrorFromStatus(
  req: Request,
  status: number,
  body: Record<string, unknown>,
  code: string,
): Response {
  const report = buildFailedReport(code, {
    image: { status: "failed", code, detail: String(body.message ?? body.error ?? "") },
  });
  return jsonResponse(
    req,
    { ...body, pipeline_report: report, error_code: code, message: report.user_message },
    status,
  );
}

export function isUnknownBrandForPipeline(brandName: string): boolean {
  const t = brandName.trim().toLowerCase();
  return t === "" || t === "unknown" || t === "unknown brand" || t.includes("brand unclear");
}

export function classifyUserPhotoQuality(ai: Record<string, unknown>, brandName: string): boolean {
  const conf = Math.min(1, Math.max(0, Number(ai.brand_confidence ?? 0) || 0));
  if (conf > 0 && conf < 0.35) return true;
  if (isUnknownBrandForPipeline(brandName)) return true;
  return false;
}

export function buildCompletePipelineReport(args: {
  aiResult: Record<string, unknown>;
  brandName: string;
  insufficientSoldData: boolean;
  ebayLiveCompCount: number;
  ebayScrapeRejected: boolean;
  vintedScrapeRejected: boolean;
  depopScrapeRejected: boolean;
  scrapingBeeConfigured: boolean;
  ebayFindingConfigured?: boolean;
  scanPersist: { ok: boolean; skipped?: boolean; reason?: string; error?: { code: string; message: string } };
  identificationFromCache: boolean;
  visionSkipped: boolean;
}): PipelineReport {
  const stages = emptyStages();
  const warnings: string[] = [];

  if (args.identificationFromCache || args.visionSkipped) {
    stages.vision = { status: "skipped", code: "cache_hit", detail: "Used cached identification" };
  } else {
    stages.vision = { status: "ok" };
  }

  if (!args.ebayFindingConfigured) {
    stages.ebay_scrape = { status: "failed", code: E.MARKET_SCRAPE, detail: "EBAY_APP_ID not configured" };
    warnings.push("eBay Finding API not configured");
  } else if (args.ebayScrapeRejected) {
    stages.ebay_scrape = { status: "failed", code: E.MARKET_SCRAPE };
    warnings.push("eBay Finding API failed");
  } else {
    stages.ebay_scrape = { status: "ok", code: "finding_api" };
  }
  if (args.vintedScrapeRejected || args.depopScrapeRejected) {
    warnings.push("Secondary marketplace scrape had errors");
  }
  if (!args.scrapingBeeConfigured) {
    warnings.push("ScrapingBee not configured (Vinted/Depop only)");
  }

  if (args.insufficientSoldData) {
    stages.pricing = {
      status: "warn",
      code: U.INSUFFICIENT_COMPS,
      detail: `ebay_sold_comp_count=${args.ebayLiveCompCount}`,
    };
  } else {
    stages.pricing = { status: "ok" };
  }

  if (!args.scanPersist.ok) {
    stages.scan_persist = {
      status: args.scanPersist.skipped ? "skipped" : "failed",
      code: args.scanPersist.skipped ? E.SUPABASE_CONFIG : E.SCAN_PERSIST,
      detail: args.scanPersist.skipped
        ? String(args.scanPersist.reason ?? "")
        : args.scanPersist.error
          ? `${args.scanPersist.error.code}: ${args.scanPersist.error.message}`
          : "insert failed",
    };
    if (!args.scanPersist.skipped) warnings.push("Scan row not saved to history");
  } else {
    stages.scan_persist = { status: "ok" };
  }

  const poorPhoto = classifyUserPhotoQuality(args.aiResult, args.brandName);
  if (poorPhoto) {
    stages.vision = {
      ...stages.vision,
      status: stages.vision.status === "ok" ? "warn" : stages.vision.status,
      code: U.LOW_BRAND_CONFIDENCE,
      detail: `brand_confidence=${args.aiResult.brand_confidence ?? 0}`,
    };
  }

  // User trust path: insufficient comps — manual browse (not an E- error)
  if (args.insufficientSoldData) {
    const userMsg = poorPhoto
      ? `${PIPELINE_USER_MESSAGE_PHOTO_QUALITY} ${PIPELINE_USER_MESSAGE_MANUAL_BROWSE}.`
      : PIPELINE_USER_MESSAGE_MANUAL_BROWSE;
    return buildPartialReport({
      primary_code: U.INSUFFICIENT_COMPS,
      issue_category: "user",
      user_message: userMsg,
      stages,
      warnings,
    });
  }

  if (poorPhoto) {
    return buildPartialReport({
      primary_code: U.LOW_BRAND_CONFIDENCE,
      issue_category: "user",
      user_message: PIPELINE_USER_MESSAGE_PHOTO_QUALITY,
      stages,
      warnings,
    });
  }

  if (!args.scanPersist.ok && !args.scanPersist.skipped) {
    return buildPartialReport({
      primary_code: E.SCAN_PERSIST,
      issue_category: "system",
      user_message: systemMessageForCode(E.SCAN_PERSIST),
      stages,
      warnings,
    });
  }

  if (warnings.length > 0) {
    return buildPartialReport({
      primary_code: E.MARKET_SCRAPE,
      issue_category: "system",
      user_message: systemMessageForCode(E.MARKET_SCRAPE),
      stages,
      warnings,
    });
  }

  return buildOkReport(stages, warnings.length ? warnings : undefined);
}
