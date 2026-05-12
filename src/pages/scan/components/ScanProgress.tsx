interface ScanProgressProps {
  currentStep: number; // 1 = analysing, 2 = brand, 3 = prices, 4 = profit, 5 = done
}

const STEPS = [
  { icon: '🔍', label: 'Analysing image...' },
  { icon: '✅', label: 'Brand identified' },
  { icon: '💰', label: 'Checking live prices...' },
  { icon: '⚡', label: 'Calculating profit...' },
];

export default function ScanProgress({ currentStep }: ScanProgressProps) {
  // progress bar: each step is 25%
  const progressPct = Math.min(((currentStep - 1) / STEPS.length) * 100, 95);

  return (
    <div className="w-full max-w-md mx-auto">
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm px-6 py-7">

        {/* Header */}
        <div className="flex items-center gap-3 mb-6">
          <div className="w-9 h-9 flex items-center justify-center rounded-xl bg-black">
            <i className="ri-scan-2-line text-white text-base animate-pulse"></i>
          </div>
          <div>
            <p className="text-sm font-bold text-gray-900">Scanning your item</p>
            <p className="text-xs text-gray-400">Checking live market prices…</p>
          </div>
        </div>

        {/* Progress bar */}
        <div className="w-full h-1.5 bg-gray-100 rounded-full mb-6 overflow-hidden">
          <div
            className="h-full bg-black rounded-full transition-all duration-700 ease-out"
            style={{ width: `${progressPct}%` }}
          />
        </div>

        {/* Steps */}
        <div className="space-y-4">
          {STEPS.map((step, index) => {
            const stepNum = index + 1;
            const isDone = currentStep > stepNum;
            const isActive = currentStep === stepNum;
            const isPending = currentStep < stepNum;

            return (
              <div
                key={index}
                className={`flex items-center gap-3 transition-all duration-500 ${
                  isPending ? 'opacity-35' : 'opacity-100'
                }`}
              >
                {/* Status indicator */}
                <div className="w-6 h-6 flex items-center justify-center flex-shrink-0">
                  {isDone ? (
                    <div className="w-5 h-5 flex items-center justify-center rounded-full bg-emerald-500 transition-all duration-300">
                      <i className="ri-check-line text-white text-xs"></i>
                    </div>
                  ) : isActive ? (
                    <div className="w-5 h-5 flex items-center justify-center rounded-full border-2 border-black border-t-transparent animate-spin" />
                  ) : (
                    <div className="w-5 h-5 flex items-center justify-center rounded-full border-2 border-gray-200" />
                  )}
                </div>

                {/* Icon + label */}
                <div className="flex items-center gap-2.5 flex-1">
                  <span className="text-base leading-none">{step.icon}</span>
                  <span
                    className={`text-sm font-medium transition-all duration-300 ${
                      isDone
                        ? 'text-emerald-600'
                        : isActive
                        ? 'text-gray-900'
                        : 'text-gray-400'
                    }`}
                  >
                    {step.label}
                  </span>
                </div>

                {/* Right side */}
                {isDone && (
                  <span className="text-xs font-semibold text-emerald-500 whitespace-nowrap">Done</span>
                )}
                {isActive && (
                  <span className="flex gap-0.5">
                    {[0, 1, 2].map((i) => (
                      <span
                        key={i}
                        className="w-1 h-1 rounded-full bg-gray-400 animate-bounce"
                        style={{ animationDelay: `${i * 0.15}s` }}
                      />
                    ))}
                  </span>
                )}
              </div>
            );
          })}
        </div>

        <p className="text-xs text-gray-400 text-center mt-6">
          Scanning Vinted, eBay &amp; Depop in real time
        </p>
      </div>
    </div>
  );
}