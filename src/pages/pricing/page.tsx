import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Header from '../../components/feature/Header';
import Footer from '../../components/feature/Footer';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { supabaseFunctionUrl } from '../../lib/supabaseFunctions';

const STRIPE_CHECKOUT_URL = supabaseFunctionUrl('stripe-checkout');

interface Plan {
  id: string;
  name: string;
  price: string;
  period: string;
  scanLabel: string;
  description: string;
  features: string[];
  cta: string;
  popular: boolean;
  badge?: string;
  badgeColor?: string;
  oneOff?: boolean;
}

const plans: Plan[] = [
  {
    id: 'drop_in',
    name: 'Drop In',
    price: '£3',
    period: 'one-off',
    scanLabel: '10 scans',
    description: 'Top up with no commitment',
    features: [
      '10 item scans (one-time)',
      'AI profit predictions',
      'Brand authentication',
      'Valid for 30 days',
      'No subscription required',
    ],
    cta: 'Get 10 scans',
    popular: false,
    oneOff: true,
  },
  {
    id: 'scout',
    name: 'Scout',
    price: '£9.99',
    period: '/month',
    scanLabel: '75 scans/month',
    description: 'Perfect for casual resellers testing the waters',
    features: [
      '75 item scans per month',
      'AI-powered profit predictions',
      'Brand authentication',
      'Market trend insights',
      'Save unlimited items',
      'Email support',
    ],
    cta: 'Start Scout',
    popular: false,
  },
  {
    id: 'trader',
    name: 'Trader',
    price: '£19.99',
    period: '/month',
    scanLabel: 'Unlimited scans',
    description: 'For serious resellers scaling their business',
    features: [
      'Unlimited item scans',
      'Everything in Scout, plus:',
      'Priority AI processing',
      'Advanced analytics dashboard',
      'Profit tracking & reports',
      'Bulk scanning',
      'Priority support',
    ],
    cta: 'Start Trader',
    popular: true,
    badge: 'Most popular',
    badgeColor: 'bg-[#1a3d2b] text-white',
  },
];

const faqs = [
  {
    question: 'What happens when I run out of scans?',
    answer:
      "You'll see a prompt to top up with Drop In or upgrade your plan. Trader and Pro have unlimited scans so you'll never hit a wall.",
  },
  {
    question: 'Can I cancel anytime?',
    answer:
      "Yes. Scout, Trader, and Pro plans can be cancelled anytime. You keep access until the end of your billing period. No questions asked.",
  },
  {
    question: 'Do unused scans roll over?',
    answer:
      'Scout scans reset each month. Trader and Pro are unlimited. Drop In scans are valid for 30 days from purchase.',
  },
  {
    question: "What's the difference between Drop In and monthly plans?",
    answer:
      'Drop In is a one-off purchase of 10 scans with no recurring charges. Monthly plans give you more volume and reset automatically.',
  },
  {
    question: 'Which platforms does Marginn support?',
    answer:
      'Marginn provides resale predictions optimised for Vinted, Depop, and eBay — the top platforms for fashion reselling in the UK.',
  },
  {
    question: 'How accurate are the predictions?',
    answer:
      'Our AI analyses real sold listings across Vinted, Depop, and eBay. The more you use Marginn, the better the predictions get.',
  },
];

export default function PricingPage() {
  const navigate = useNavigate();
  const { user, profile } = useAuth();
  const { showToast } = useToast();
  const [openFaq, setOpenFaq] = useState<number | null>(null);
  const [loadingPlan, setLoadingPlan] = useState<string | null>(null);

  const handlePlanClick = async (plan: Plan) => {
    if (!user) {
      navigate('/signup');
      return;
    }

    setLoadingPlan(plan.id);
    try {
      const res = await fetch(STRIPE_CHECKOUT_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          plan: plan.id,
          user_id: user.id,
          user_email: user.email,
          success_url: `${window.location.origin}/scan?payment_success=1&plan=${plan.id}&session_id={CHECKOUT_SESSION_ID}`,
          cancel_url: `${window.location.origin}/pricing`,
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? 'Could not start checkout');
      }

      const { url } = await res.json();
      if (url) {
        window.location.href = url;
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Something went wrong';
      showToast(msg, 'error');
    } finally {
      setLoadingPlan(null);
    }
  };

  const currentPlan = profile?.plan ?? 'free';

  return (
    <div className="min-h-screen flex flex-col bg-white">
      <Header />

      <main className="flex-1 pt-16">
        {/* Hero */}
        <section className="py-16 px-6 bg-gradient-to-b from-gray-50 to-white">
          <div className="max-w-4xl mx-auto text-center">
            <h1 className="text-5xl font-bold text-gray-900 mb-4">
              Simple, transparent pricing
            </h1>
            <p className="text-xl text-gray-500 mb-3">
              Choose the plan that fits your reselling goals.
            </p>
            <p className="text-sm text-[#1a3d2b] font-medium">
              Start with 5 free scans — no card needed
            </p>
          </div>
        </section>

        {/* Plans */}
        <section className="py-14 px-6">
          <div className="max-w-6xl mx-auto">
            <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-5">
              {plans.map((plan) => {
                const isCurrentPlan = currentPlan === plan.id;
                const isLoading = loadingPlan === plan.id;

                return (
                  <div
                    key={plan.id}
                    className={`relative rounded-2xl border-2 p-7 flex flex-col transition-all duration-200 ${
                      plan.popular
                        ? 'border-[#1a3d2b] shadow-lg'
                        : 'border-gray-200 hover:border-gray-300'
                    }`}
                  >
                    {plan.badge && (
                      <div
                        className={`absolute -top-3.5 left-1/2 -translate-x-1/2 ${plan.badgeColor} px-4 py-1 rounded-full text-xs font-semibold whitespace-nowrap`}
                      >
                        {plan.badge}
                      </div>
                    )}

                    <div className="mb-5">
                      <div className="flex items-center justify-between mb-1">
                        <h3 className="text-xl font-bold text-gray-900">{plan.name}</h3>
                        {plan.oneOff && (
                          <span className="text-xs bg-amber-100 text-amber-700 font-semibold px-2 py-0.5 rounded-full">
                            One-off
                          </span>
                        )}
                      </div>
                      <p className="text-gray-400 text-xs mb-4">{plan.description}</p>
                      <div className="flex items-baseline gap-1">
                        <span className="text-4xl font-bold text-gray-900">{plan.price}</span>
                        <span className="text-gray-400 text-sm">{plan.period}</span>
                      </div>
                      <p className="text-sm font-semibold text-[#1a3d2b] mt-1.5">
                        {plan.scanLabel}
                      </p>
                    </div>

                    <ul className="space-y-2.5 mb-7 flex-1">
                      {plan.features.map((f, i) => (
                        <li key={i} className="flex items-start gap-2.5">
                          <div className="w-4 h-4 flex items-center justify-center flex-shrink-0 mt-0.5">
                            <i className="ri-check-line text-[#1a3d2b] text-sm" />
                          </div>
                          <span className="text-gray-600 text-xs">{f}</span>
                        </li>
                      ))}
                    </ul>

                    <button
                      onClick={() => handlePlanClick(plan)}
                      disabled={isLoading || isCurrentPlan}
                      className={`w-full py-3 px-5 rounded-md text-sm font-semibold transition-all whitespace-nowrap cursor-pointer disabled:cursor-not-allowed ${
                        isCurrentPlan
                          ? 'bg-gray-100 text-gray-400 cursor-default'
                          : plan.popular
                          ? 'bg-[#1a3d2b] text-white hover:bg-[#2d5a40]'
                          : 'bg-gray-900 text-white hover:bg-gray-800'
                      }`}
                    >
                      {isLoading ? (
                        <span className="flex items-center justify-center gap-2">
                          <i className="ri-loader-4-line animate-spin" />
                          Redirecting...
                        </span>
                      ) : isCurrentPlan ? (
                        'Current plan'
                      ) : (
                        plan.cta
                      )}
                    </button>
                  </div>
                );
              })}
            </div>

            {/* Free trial note */}
            {!user && (
              <div className="mt-8 bg-[#1a3d2b]/5 border border-[#1a3d2b]/20 rounded-xl px-6 py-4 flex flex-col sm:flex-row items-center justify-between gap-4 text-center sm:text-left">
                <div>
                  <p className="font-semibold text-gray-900 text-sm">
                    Not ready to commit? Start free
                  </p>
                  <p className="text-xs text-gray-500 mt-0.5">
                    5 scans included with every new account
                  </p>
                </div>
                <button
                  onClick={() => navigate('/signup')}
                  className="bg-[#1a3d2b] text-white px-6 py-2.5 rounded-md text-sm font-semibold hover:bg-[#2d5a40] transition-colors whitespace-nowrap cursor-pointer"
                >
                  Create free account →
                </button>
              </div>
            )}
          </div>
        </section>

        {/* Comparison table */}
        <section className="py-14 px-6 bg-gray-50">
          <div className="max-w-6xl mx-auto">
            <h2 className="text-3xl font-bold text-gray-900 text-center mb-10">Compare plans</h2>
            <div className="bg-white rounded-2xl overflow-hidden border border-gray-100">
              <table className="w-full">
                <thead className="bg-gray-50 border-b border-gray-100">
                  <tr>
                    <th className="text-left py-4 px-6 text-sm font-semibold text-gray-900">Feature</th>
                    <th className="text-center py-4 px-4 text-sm font-semibold text-gray-900">Free</th>
                    <th className="text-center py-4 px-4 text-sm font-semibold text-gray-900">Drop In</th>
                    <th className="text-center py-4 px-4 text-sm font-semibold text-gray-900">Scout</th>
                    <th className="text-center py-4 px-4 text-sm font-semibold text-[#1a3d2b]">Trader</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {[
                    ['Monthly scans', '5', '10', '75', '∞'],
                    ['AI profit predictions', '✓', '✓', '✓', '✓'],
                    ['Brand authentication', '✓', '✓', '✓', '✓'],
                    ['Save items', '—', '—', '✓', '✓'],
                    ['Advanced analytics', '—', '—', '—', '✓'],
                    ['Profit tracking', '—', '—', '—', '✓'],
                    ['Bulk scanning', '—', '—', '—', '✓'],
                    ['Priority support', '—', '—', '—', '✓'],
                  ].map(([label, free, drop_in, scout, trader]) => (
                    <tr key={label}>
                      <td className="py-3.5 px-6 text-sm text-gray-700">{label}</td>
                      {[free, drop_in, scout, trader].map((val, i) => (
                        <td key={i} className="py-3.5 px-4 text-center">
                          {val === '✓' ? (
                            <div className="w-5 h-5 flex items-center justify-center mx-auto">
                              <i className="ri-check-line text-[#1a3d2b] text-base" />
                            </div>
                          ) : val === '—' ? (
                            <div className="w-5 h-5 flex items-center justify-center mx-auto">
                              <i className="ri-close-line text-gray-300 text-base" />
                            </div>
                          ) : (
                            <span className="text-sm font-semibold text-gray-900">{val}</span>
                          )}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </section>

        {/* FAQ */}
        <section className="py-14 px-6">
          <div className="max-w-3xl mx-auto">
            <h2 className="text-3xl font-bold text-gray-900 text-center mb-10">
              Frequently asked questions
            </h2>
            <div className="space-y-3">
              {faqs.map((faq, i) => (
                <div key={i} className="border border-gray-200 rounded-xl overflow-hidden">
                  <button
                    onClick={() => setOpenFaq(openFaq === i ? null : i)}
                    className="w-full flex items-center justify-between px-6 py-4 text-left hover:bg-gray-50 transition-colors cursor-pointer"
                  >
                    <span className="font-semibold text-gray-900 text-sm pr-4">{faq.question}</span>
                    <div className="w-5 h-5 flex items-center justify-center flex-shrink-0">
                      <i
                        className={`ri-arrow-down-s-line text-gray-400 text-xl transition-transform duration-200 ${
                          openFaq === i ? 'rotate-180' : ''
                        }`}
                      />
                    </div>
                  </button>
                  {openFaq === i && (
                    <div className="px-6 pb-5 text-sm text-gray-500 leading-relaxed">
                      {faq.answer}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* CTA */}
        <section className="py-14 px-6 bg-[#1a3d2b]">
          <div className="max-w-3xl mx-auto text-center">
            <h2 className="text-4xl font-bold text-white mb-4">Start flipping smarter</h2>
            <p className="text-[#a8c5b5] text-lg mb-8">
              Join resellers making better buying decisions with Marginn
            </p>
            <div className="flex flex-wrap gap-4 justify-center">
              <button
                onClick={() => navigate(user ? '/scan' : '/signup')}
                className="bg-white text-[#1a3d2b] px-8 py-3 rounded-md font-semibold hover:bg-gray-50 transition-colors whitespace-nowrap cursor-pointer"
              >
                {user ? 'Go to scanner →' : 'Start free — 5 scans included'}
              </button>
            </div>
          </div>
        </section>
      </main>

      <Footer />
    </div>
  );
}
