import type { ForensicAuthentication } from '../../../lib/forensicAuthentication';

interface ForensicAuthBannerProps {
  loading?: boolean;
  auth: ForensicAuthentication | null | undefined;
  score?: number | null;
}

const VERDICT_UI: Record<
  ForensicAuthentication['verdict'],
  { bg: string; border: string; icon: string; label: string }
> = {
  AUTHENTIC: {
    bg: 'bg-emerald-600',
    border: 'border-emerald-700/40',
    icon: 'ri-shield-check-fill',
    label: 'Likely authentic',
  },
  SUSPICIOUS: {
    bg: 'bg-amber-500',
    border: 'border-amber-600/40',
    icon: 'ri-error-warning-fill',
    label: 'Suspicious — review carefully',
  },
  UNVERIFIABLE: {
    bg: 'bg-slate-600',
    border: 'border-slate-700/40',
    icon: 'ri-question-line',
    label: 'Cannot verify from photo',
  },
};

export default function ForensicAuthBanner({ loading, auth, score }: ForensicAuthBannerProps) {
  if (loading && !auth) {
    return (
      <div
        className="px-4 py-3 border-b border-gray-100 bg-gray-50"
        aria-busy="true"
        aria-label="Running authentication"
      >
        <div className="flex gap-2.5 items-center">
          <div className="h-8 w-8 rounded-full bg-gray-200 animate-pulse shrink-0" />
          <div className="flex-1 space-y-2">
            <div className="h-3 w-40 bg-gray-200 rounded animate-pulse" />
            <div className="h-2.5 w-full bg-gray-100 rounded animate-pulse" />
          </div>
        </div>
      </div>
    );
  }
  if (!auth) return null;

  const ui = VERDICT_UI[auth.verdict];
  const pct =
    score != null && Number.isFinite(score) ? Math.round(score) : Math.round(auth.confidence * 100);

  return (
    <div className={`${ui.bg} text-white px-4 py-3 border-b ${ui.border}`}>
      <div className="flex gap-2.5 items-start">
        <i className={`${ui.icon} text-xl shrink-0 mt-0.5`} aria-hidden />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
            <p className="text-[10px] font-black uppercase tracking-wider opacity-95">
              Forensic authentication
            </p>
            <span className="text-[10px] font-bold opacity-90">{pct}% confidence</span>
          </div>
          <p className="text-sm font-black mt-0.5">{ui.label}</p>
          {auth.authentication_notes ? (
            <p className="text-xs font-medium leading-snug mt-1 opacity-95">{auth.authentication_notes}</p>
          ) : null}
        </div>
      </div>
      {auth.evidence.length > 0 ? (
        <ul className="mt-2.5 space-y-1 text-[11px] font-medium opacity-95 list-disc pl-5">
          {auth.evidence.map((line, i) => (
            <li key={`${i}-${line.slice(0, 24)}`} className="leading-snug">
              {line}
            </li>
          ))}
        </ul>
      ) : null}
      {auth.risk_flags.length > 0 ? (
        <div className="mt-2 rounded-lg bg-black/15 px-2.5 py-2">
          <p className="text-[10px] font-black uppercase tracking-wide opacity-90">Risk flags</p>
          <p className="text-[11px] font-semibold mt-0.5 leading-snug">{auth.risk_flags.join(' · ')}</p>
        </div>
      ) : null}
      {auth.recommend_physical_check && auth.recommend_physical_check_reason ? (
        <p className="mt-2 text-[11px] font-semibold bg-white/15 rounded-lg px-2.5 py-2 leading-snug">
          Recommend in-person check: {auth.recommend_physical_check_reason}
        </p>
      ) : null}
    </div>
  );
}
