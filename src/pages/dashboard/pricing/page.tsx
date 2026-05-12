import { useState } from 'react';
import DashboardLayout from '../components/DashboardLayout';
import Card from '../../../components/base/Card';
import Button from '../../../components/base/Button';
import { useAuth } from '../../../context/AuthContext';
import { useToast } from '../../../context/ToastContext';
import { supabaseFunctionUrl } from '../../../lib/supabaseFunctions';

const STRIPE_CANCEL_URL = supabaseFunctionUrl('stripe-cancel');

export default function DashboardPricingPage() {
  const { profile, refreshProfile } = useAuth();
  const { showToast } = useToast();
  const [cancelling, setCancelling] = useState(false);

  const handleCancelSubscription = async () => {
    if (!profile?.stripe_subscription_id) {
      showToast('No active subscription found', 'error');
      return;
    }

    if (!confirm('Are you sure you want to cancel? You\'ll keep access until the end of your billing period.')) {
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
      showToast('Subscription cancelled. You\'ll keep access until the end of your billing period.', 'success');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Something went wrong';
      showToast(msg, 'error');
    } finally {
      setCancelling(false);
    }
  };

  const plans = [
    {
      name: 'Free Trial',
      price: '£0',
      period: '',
      description: 'Get started with no commitment',
      features: [
        '5 scans included',
        'No credit card required',
        'AI profit predictions',
        'Vinted & Depop data',
        'Perfect for getting started'
      ],
      current: profile?.plan === 'free' || !profile?.plan
    },
    {
      name: 'Scout',
      price: '£9.99',
      period: '/month',
      description: 'Perfect for casual sellers',
      features: [
        '75 scans per month',
        'Basic price analysis',
        'Vinted & Depop data',
        'Email support',
        'Scan history (30 days)'
      ],
      current: profile?.plan === 'scout'
    },
    {
      name: 'Trader',
      price: '£19.99',
      period: '/month',
      description: 'For serious resellers',
      features: [
        'Unlimited scans',
        'Advanced analytics',
        'All marketplace data',
        'Price alerts & notifications',
        'Priority support',
        'Export data (CSV/PDF)',
        'Unlimited scan history',
        'Bulk scanning (coming soon)'
      ],
      popular: true,
      current: profile?.plan === 'trader'
    },
    {
      name: 'Drop In',
      price: '£3',
      period: 'one-off',
      description: 'Top up with no commitment',
      features: [
        '10 scans',
        'No subscription required',
        'Basic price analysis',
        'Vinted & Depop data',
        'Perfect for topping up'
      ],
      current: profile?.plan === 'drop_in'
    }
  ];

  return (
    <DashboardLayout>
      <div className="space-y-8">
        <div>
          <h1 className="text-3xl font-bold text-black mb-2">Pricing Plans</h1>
          <p className="text-gray-600">
            Upgrade your plan to unlock more features and get better insights
          </p>
        </div>
        
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
          {plans.map((plan, index) => (
            <Card key={index} className={`relative p-8 ${plan.popular ? 'border-2 border-black' : ''}`}>
              {plan.popular && (
                <div className="absolute -top-3 left-1/2 transform -translate-x-1/2">
                  <span className="bg-black text-white px-4 py-1 text-sm font-medium rounded-full whitespace-nowrap">
                    Most Popular
                  </span>
                </div>
              )}
              
              {plan.current && (
                <div className="absolute top-4 right-4">
                  <span className="bg-green-100 text-green-800 px-3 py-1 text-xs font-medium rounded-full whitespace-nowrap">
                    Current Plan
                  </span>
                </div>
              )}
              
              <div className="mb-8">
                <h3 className="text-2xl font-bold text-black mb-2">{plan.name}</h3>
                <p className="text-gray-600 mb-4">{plan.description}</p>
                <div className="flex items-baseline">
                  <span className="text-4xl font-bold text-black">{plan.price}</span>
                  <span className="text-gray-600 ml-1">{plan.period}</span>
                </div>
              </div>
              
              <ul className="space-y-4 mb-8">
                {plan.features.map((feature, featureIndex) => (
                  <li key={featureIndex} className="flex items-start">
                    <i className="ri-check-line text-green-500 mr-3 mt-0.5 flex-shrink-0"></i>
                    <span className="text-gray-700">{feature}</span>
                  </li>
                ))}
              </ul>
              
              <Button 
                className={`w-full whitespace-nowrap ${
                  plan.current
                    ? 'bg-gray-100 text-gray-500 cursor-not-allowed'
                    : plan.popular 
                      ? 'bg-black text-white hover:bg-gray-800' 
                      : 'bg-gray-100 text-black hover:bg-gray-200'
                }`}
                disabled={plan.current}
              >
                {plan.current ? 'Current Plan' : 'Choose Plan'}
              </Button>
            </Card>
          ))}
        </div>
        
        {profile?.stripe_subscription_id && profile?.plan !== 'free' && (
          <Card className="p-6 border-amber-200 bg-amber-50">
            <div className="flex items-start justify-between">
              <div className="flex items-start">
                <i className="ri-alert-line text-amber-600 mr-3 mt-1 flex-shrink-0"></i>
                <div>
                  <h4 className="font-semibold text-black mb-2">Cancel Subscription</h4>
                  <p className="text-gray-600 mb-4">
                    You can cancel anytime. You'll keep full access until the end of your current billing period. No questions asked.
                  </p>
                </div>
              </div>
              <Button 
                variant="outline" 
                size="sm" 
                onClick={handleCancelSubscription}
                disabled={cancelling}
                className="whitespace-nowrap border-amber-300 text-amber-700 hover:bg-amber-100"
              >
                {cancelling ? 'Cancelling...' : 'Cancel Subscription'}
              </Button>
            </div>
          </Card>
        )}

        <Card className="p-6 bg-gray-50">
          <div className="flex items-start">
            <i className="ri-information-line text-teal-500 mr-3 mt-1 flex-shrink-0"></i>
            <div>
              <h4 className="font-semibold text-black mb-2">Need a custom plan?</h4>
              <p className="text-gray-600 mb-4">
                If you're processing high volumes or need enterprise features, we can create a custom plan for your business.
              </p>
              <Button variant="outline" size="sm" className="whitespace-nowrap">
                Contact Sales
              </Button>
            </div>
          </div>
        </Card>
      </div>
    </DashboardLayout>
  );
}