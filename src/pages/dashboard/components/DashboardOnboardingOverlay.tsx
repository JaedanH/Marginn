import { useState } from 'react';
import { supabase } from '../../../supabaseClient';
import { useAuth } from '../../../context/AuthContext';

const SLIDES = [
  {
    title: 'Snap your item',
    body:
      'Take a clear photo of labels, logos, and condition. Marginn reads the image so you do not have to type specs.',
    icon: 'ri-camera-line',
  },
  {
    title: 'AI + real comps',
    body:
      'We cross-check sold and live listings on eBay UK, Vinted, and Depop so resale estimates reflect what buyers actually pay.',
    icon: 'ri-search-eye-line',
  },
  {
    title: 'Profit signal',
    body:
      'See net profit, max buy, verdict, and an estimated CO₂ saving — built for UK resellers flipping fashion and streetwear.',
    icon: 'ri-line-chart-line',
  },
];

export default function DashboardOnboardingOverlay() {
  const { profile, refreshProfile } = useAuth();
  const [step, setStep] = useState(0);
  const [saving, setSaving] = useState(false);

  if (profile?.onboarding_completed !== false) {
    return null;
  }

  const finish = async () => {
    if (!profile?.id) return;
    setSaving(true);
    try {
      const { error } = await supabase
        .from('profiles')
        .update({ onboarding_completed: true })
        .eq('id', profile.id);
      if (error) console.error('[onboarding] update failed', error);
      await refreshProfile();
    } finally {
      setSaving(false);
    }
  };

  const slide = SLIDES[step];
  const isLast = step === SLIDES.length - 1;

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full overflow-hidden border border-gray-100">
        <div className="p-8 pb-6">
          <div className="w-14 h-14 rounded-2xl bg-[#1a3d2b]/10 flex items-center justify-center mb-5">
            <i className={`${slide.icon} text-2xl text-[#1a3d2b]`} />
          </div>
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">
            Welcome to Marginn · {step + 1} / {SLIDES.length}
          </p>
          <h2 className="text-2xl font-bold text-gray-900 mb-3">{slide.title}</h2>
          <p className="text-sm text-gray-600 leading-relaxed">{slide.body}</p>
          <div className="flex gap-1.5 mt-6">
            {SLIDES.map((_, i) => (
              <span
                key={i}
                className={`h-1.5 flex-1 rounded-full transition-colors ${i === step ? 'bg-[#1a3d2b]' : 'bg-gray-200'}`}
              />
            ))}
          </div>
        </div>
        <div className="flex items-center justify-between gap-3 px-8 py-5 bg-gray-50 border-t border-gray-100">
          <button
            type="button"
            onClick={finish}
            disabled={saving}
            className="text-sm font-medium text-gray-500 hover:text-gray-800 cursor-pointer disabled:opacity-50"
          >
            Skip
          </button>
          <div className="flex gap-2">
            {step > 0 && (
              <button
                type="button"
                onClick={() => setStep((s) => s - 1)}
                className="px-4 py-2.5 rounded-xl border border-gray-200 text-sm font-semibold text-gray-700 hover:bg-white cursor-pointer"
              >
                Back
              </button>
            )}
            <button
              type="button"
              onClick={() => (isLast ? finish() : setStep((s) => s + 1))}
              disabled={saving}
              className="px-5 py-2.5 rounded-xl bg-black text-white text-sm font-semibold hover:bg-gray-900 cursor-pointer disabled:opacity-50"
            >
              {saving ? '…' : isLast ? 'Get started' : 'Next'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
