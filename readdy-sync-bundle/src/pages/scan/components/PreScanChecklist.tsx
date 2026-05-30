const DISMISS_KEY = 'marginn_prescan_checklist_dismissed';
const SESSION_SUCCESS_KEY = 'marginn_prescan_scan_session_ok';

export function getPrescanChecklistInitiallyVisible(): boolean {
  try {
    if (localStorage.getItem(DISMISS_KEY) === '1') return false;
    if (sessionStorage.getItem(SESSION_SUCCESS_KEY) === '1') return false;
  } catch {
    /* ignore */
  }
  return true;
}

/** After a successful scan this session, hide the checklist until the tab is closed. */
export function markPrescanSessionScanSuccess(): void {
  try {
    sessionStorage.setItem(SESSION_SUCCESS_KEY, '1');
  } catch {
    /* ignore */
  }
}

function persistDismiss(): void {
  try {
    localStorage.setItem(DISMISS_KEY, '1');
  } catch {
    /* ignore */
  }
}

const ITEMS = [
  { icon: 'ri-layout-horizontal-line', text: 'Lay the item flat' },
  { icon: 'ri-price-tag-3-line', text: 'Keep logo / label visible' },
  { icon: 'ri-sun-line', text: 'Use good, even lighting' },
] as const;

interface PreScanChecklistProps {
  visible: boolean;
  onDismiss: () => void;
  className?: string;
}

export default function PreScanChecklist({ visible, onDismiss, className = '' }: PreScanChecklistProps) {
  if (!visible) return null;

  return (
    <div
      role="region"
      aria-label="Photo tips"
      className={`rounded-2xl border border-gray-200 bg-gray-50/80 px-4 py-3 text-left ${className}`}
    >
      <div className="flex items-start justify-between gap-2 mb-2">
        <p className="text-xs font-bold text-gray-800 uppercase tracking-wide">Quick photo checklist</p>
        <button
          type="button"
          onClick={() => {
            persistDismiss();
            onDismiss();
          }}
          className="text-[11px] font-medium text-gray-500 hover:text-gray-800 shrink-0 cursor-pointer"
        >
          Dismiss
        </button>
      </div>
      <ul className="space-y-2">
        {ITEMS.map((row) => (
          <li key={row.text} className="flex items-center gap-2.5 text-xs text-gray-700">
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-white border border-gray-100">
              <i className={`${row.icon} text-gray-500`} />
            </span>
            <span>{row.text}</span>
          </li>
        ))}
      </ul>
      <p className="text-[10px] text-gray-400 mt-2 leading-snug">
        Tips only — you can still scan anytime. Add up to 3 angles for trickier pieces.
      </p>
    </div>
  );
}
