/**
 * Client mirror of Edge pipeline diagnostics (analyse-item `pipeline_report`).
 */

export type PipelineIssueCategory = 'none' | 'user' | 'system';

export type PipelineStageStatus = {
  status: 'ok' | 'skipped' | 'warn' | 'failed';
  code?: string | null;
  detail?: string | null;
};

export type PipelineReport = {
  pipeline_status: 'ok' | 'partial' | 'failed';
  issue_category: PipelineIssueCategory;
  primary_code: string | null;
  user_message: string;
  stages: Record<string, PipelineStageStatus>;
  warnings?: string[];
};

export const COPY_MANUAL_BROWSE = 'Limited data — browse manually';

export class ScanPipelineError extends Error {
  readonly errorCode: string | null;
  readonly issueCategory: PipelineIssueCategory;
  readonly pipelineReport: PipelineReport | null;

  constructor(
    message: string,
    opts?: {
      errorCode?: string | null;
      issueCategory?: PipelineIssueCategory;
      pipelineReport?: PipelineReport | null;
    }
  ) {
    super(message);
    this.name = 'ScanPipelineError';
    this.errorCode = opts?.errorCode ?? null;
    this.issueCategory = opts?.issueCategory ?? 'system';
    this.pipelineReport = opts?.pipelineReport ?? null;
  }
}

function isPipelineReport(v: unknown): v is PipelineReport {
  if (!v || typeof v !== 'object') return false;
  const r = v as PipelineReport;
  return (
    typeof r.pipeline_status === 'string' &&
    typeof r.issue_category === 'string' &&
    typeof r.user_message === 'string'
  );
}

export function parsePipelineReport(payload: Record<string, unknown>): PipelineReport | null {
  const raw = payload.pipeline_report ?? payload.pipelineReport;
  return isPipelineReport(raw) ? raw : null;
}

/** User-facing scan error line (system shows E- code in message from Edge). */
export function messageForScanFailure(payload: Record<string, unknown>, fallback: string): string {
  const report = parsePipelineReport(payload);
  if (report?.user_message?.trim()) return report.user_message.trim();
  const code = payload.error_code ?? payload.errorCode;
  if (typeof code === 'string' && code.startsWith('E-')) {
    const msg = payload.message ?? payload.error;
    if (typeof msg === 'string' && msg.trim()) return msg.trim();
    return `${fallback} (${code})`;
  }
  const err = payload.error ?? payload.message;
  if (typeof err === 'string' && err.trim()) return err.trim();
  return fallback;
}

export function throwFromScanErrorPayload(
  payload: Record<string, unknown>,
  httpStatus?: number
): never {
  const report = parsePipelineReport(payload);
  const message = messageForScanFailure(
    payload,
    httpStatus ? `Request failed (${httpStatus})` : 'Scan failed. Please try again.'
  );
  throw new ScanPipelineError(message, {
    errorCode:
      (typeof payload.error_code === 'string' ? payload.error_code : null) ??
      report?.primary_code ??
      null,
    issueCategory: report?.issue_category ?? 'system',
    pipelineReport: report,
  });
}

export function pipelineReportFromComplete(
  data: Record<string, unknown>
): PipelineReport | null {
  return parsePipelineReport(data);
}

/** True when UI should use manual-browse trust path (not a hard scan failure). */
export function isUserLimitedDataReport(report: PipelineReport | null): boolean {
  if (!report) return false;
  return (
    report.issue_category === 'user' &&
    (report.primary_code === 'U-INSUFFICIENT-COMPS' ||
      report.primary_code === 'U-LOW-BRAND-CONFIDENCE' ||
      report.primary_code === 'U-UNKNOWN-BRAND')
  );
}

export function formatScanErrorForDisplay(err: unknown): string {
  if (err instanceof ScanPipelineError) return err.message;
  if (err instanceof Error && err.message.trim()) {
    const m = err.message.trim();
    if (/failed to fetch/i.test(m) || /networkerror/i.test(m)) {
      return (
        'Could not reach the scan server (network or CORS). If you are on a Readdy preview URL, ' +
        'redeploy analyse-item after the latest CORS update, or add your site origin to Supabase ' +
        'secret EDGE_EXTRA_ALLOWED_ORIGINS.'
      );
    }
    if (/^unknown$/i.test(m) || /^unknown pipeline/i.test(m)) {
      return 'Scan failed. Please try again.';
    }
    return m;
  }
  return 'Scan failed. Please try again.';
}
