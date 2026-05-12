import { useState } from 'react';
import DashboardLayout from '../components/DashboardLayout';
import Card from '../../../components/base/Card';
import Button from '../../../components/base/Button';
import { useAuth } from '../../../context/AuthContext';
import { useToast } from '../../../context/ToastContext';
import { Link } from 'react-router-dom';
import { supabaseFunctionUrl } from '../../../lib/supabaseFunctions';

const STRIPE_CANCEL_URL = supabaseFunctionUrl('stripe-cancel');

export default function BillingPage() {
  const { profile, refreshProfile } = useAuth() as any;
  const { showToast } = useToast();
  const [cancelling, setCancelling] = useState(false);
  const [showCancelConfirm, setShowCancelConfirm] = useState(false);

  const planLabel: Record<string, string> = {
    free: 'Free Trial',
    drop_in: 'Drop In',
    scout: 'Scout',
    trader: 'Trader',
    pro: 'Pro',
  };

  const planScans: Record<string, string> = {
    free: '5 scans',
    drop_in: '10 scans',
    scout: '75 scans / month',
    trader: 'Unlimited scans',
    pro: 'Unlimited scans',
  };

  const planPrice: Record<string, string> = {
    free: '£0',
    drop_in: '£3 one-off',
    scout: '£9.99 / month',
    trader: '£19.99 / month',
    pro: '£34.99 / month',
  };

  const currentPlan = profile?.plan ?? 'free';
  const isUnlimited = currentPlan === 'trader' || currentPlan === 'pro';
  const isPaid = currentPlan !== 'free' && currentPlan !== 'drop_in';

  const handleCancelSubscription = async () => {
    if (!profile?.stripe_subscription_id) {
      showToast('No active subscription found', 'error');
      return;
    }

    setCancelling(true);
    try {
      const res = await fetch(STRIPE_CANCEL_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ subscription_id: profile.stripe_subscription_id }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'Failed to cancel subscription');
      }

      await refreshProfile();
      setShowCancelConfirm(false);
      showToast('Subscription cancelled. You\'ll keep access until the end of your billing period.', 'success');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Something went wrong';
      showToast(msg, 'error');
    } finally {
      setCancelling(false);
    }
  };

  return (
    <DashboardLayout>
      <div className="space-y-8 max-w-2xl">
        <div>
          <h1 className="text-3xl font-bold text-black">Billing</h1>
          <p className="text-gray-500 mt-1">Manage your subscription and payment details</p>
        </div>

        {/* Current Plan */}
        <Card className="p-6">
          <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-4">Current Plan</h2>
          <div className="flex items-center justify-between flex-wrap gap-4">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 bg-black rounded-xl flex items-center justify-center">
                <i className="ri-vip-crown-line text-white text-xl"></i>
              </div>
              <div>
                <p className="text-xl font-bold text-black">
                  {planLabel[currentPlan] ?? currentPlan}
                </p>
                <p className="text-sm text-gray-500">
                  {planScans[currentPlan] ?? '—'} &middot; {planPrice[currentPlan] ?? '—'}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <span className={`px-3 py-1 text-xs font-semibold rounded-full ${
                isUnlimited ? 'bg-emerald-100 text-emerald-700' : 'bg-gray-100 text-gray-600'
              }`}>
                {isUnlimited ? 'Unlimited' : `${profile?.scans_limit ?? 0} scans left`}
              </span>
            </div>
          </div>
        </Card>

        {/* Usage */}
        <Card className="p-6">
          <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-4">Usage This Period</h2>
          <div className="grid grid-cols-2 gap-6">
            <div>
              <p className="text-3xl font-bold text-black">{profile?.scans_used_this_month ?? 0}</p>
              <p className="text-sm text-gray-500 mt-1">Total scans used</p>
            </div>
            <div>
              <p className="text-3xl font-bold text-emerald-600">
                {isUnlimited ? '∞' : profile?.scans_limit ?? 0}
              </p>
              <p className="text-sm text-gray-500 mt-1">Scans remaining</p>
            </div>
          </div>
          {!isUnlimited && (
            <div className="mt-4">
              <div className="flex justify-between text-xs text-gray-500 mb-1">
                <span>Used</span>
                <span>{profile?.scans_used_this_month ?? 0} / {(profile?.scans_used_this_month ?? 0) + (profile?.scans_limit ?? 0)}</span>
              </div>
              <div className="w-full bg-gray-100 rounded-full h-2">
                <div
                  className="bg-black h-2 rounded-full transition-all"
                  style={{
                    width: `${Math.min(100, ((profile?.scans_used_this_month ?? 0) / Math.max(1, (profile?.scans_used_this_month ?? 0) + (profile?.scans_limit ?? 0))) * 100)}%`
                  }}
                />
              </div>
            </div>
          )}
        </Card>

        {/* Upgrade */}
        <Card className="p-6 bg-gray-50">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 className="font-semibold text-black mb-1">Need more scans?</h2>
              <p className="text-sm text-gray-500">
                Upgrade your plan or top up with a one-off Drop In pack.
              </p>
            </div>
            <Link to="/dashboard/pricing">
              <Button className="whitespace-nowrap">View Plans</Button>
            </Link>
          </div>
        </Card>

        {/* Cancel Subscription */}
        {isPaid && profile?.stripe_subscription_id && (
          <Card className="p-6 border-red-100">
            <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-4">Danger Zone</h2>
            {!showCancelConfirm ? (
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="font-medium text-black mb-1">Cancel Subscription</p>
                  <p className="text-sm text-gray-500">
                    You'll keep full access until the end of your current billing period. No questions asked.
                  </p>
                </div>
                <button
                  onClick={() => setShowCancelConfirm(true)}
                  className="text-sm text-red-500 hover:text-red-700 font-medium cursor-pointer whitespace-nowrap transition-colors"
                >
                  Cancel plan
                </button>
              </div>
            ) : (
              <div className="bg-red-50 rounded-lg p-4">
                <p className="font-medium text-black mb-1">Are you sure?</p>
                <p className="text-sm text-gray-600 mb-4">
                  Your subscription will be cancelled at the end of the current billing period. You won't be charged again.
                </p>
                <div className="flex items-center gap-3">
                  <Button
                    onClick={handleCancelSubscription}
                    disabled={cancelling}
                    className="bg-red-500 hover:bg-red-600 text-white whitespace-nowrap"
                  >
                    {cancelling ? 'Cancelling...' : 'Yes, cancel my plan'}
                  </Button>
                  <button
                    onClick={() => setShowCancelConfirm(false)}
                    className="text-sm text-gray-500 hover:text-black cursor-pointer transition-colors"
                  >
                    Keep my plan
                  </button>
                </div>
              </div>
            )}
          </Card>
        )}
      </div>
    </DashboardLayout>
  );
}
