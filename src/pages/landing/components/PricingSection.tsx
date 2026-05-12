import Button from '../../../components/base/Button';
import Card from '../../../components/base/Card';

export default function PricingSection() {
  const plans = [
    {
      name: 'Scout',
      price: '£9.99',
      period: '/month',
      features: [
        '75 scans per month',
        'Basic price analysis',
        'Vinted & Depop data',
        'Email support',
        'Scan history (30 days)'
      ]
    },
    {
      name: 'Trader',
      price: '£19.99',
      period: '/month',
      popular: true,
      features: [
        'Unlimited scans',
        'Advanced analytics',
        'All marketplace data',
        'Price alerts',
        'Priority support',
        'Export data',
        'Unlimited scan history'
      ]
    },
    {
      name: 'Drop In',
      price: '£3',
      period: 'one-off',
      features: [
        '10 scans',
        'No subscription',
        'Basic price analysis',
        'Vinted & Depop data',
        'Perfect for trying out'
      ]
    }
  ];

  return (
    <section className="py-24 bg-white">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-16">
          <h2 className="text-4xl font-bold text-black mb-4">
            Simple pricing
          </h2>
          <p className="text-xl text-gray-600">
            Choose the plan that fits your reselling needs
          </p>
        </div>

        {/* Free Trial Banner */}
        <div className="max-w-3xl mx-auto mb-10 bg-gray-50 border border-gray-200 rounded-2xl px-8 py-5 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <span className="text-white text-xs font-semibold px-3 py-1 rounded-full whitespace-nowrap" style={{ backgroundColor: '#1a3d2b' }}>Free Trial</span>
            <p className="text-gray-700 text-sm">
              <strong className="text-black">5 free scans</strong> — no credit card required. Try Marginn before you commit.
            </p>
          </div>
          <Button className="text-white whitespace-nowrap text-sm px-6 py-2 shrink-0" style={{ backgroundColor: '#1a3d2b' }}>
            Start for free
          </Button>
        </div>

        {/* 3 Paid Plans */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 max-w-5xl mx-auto">
          {plans.map((plan, index) => (
            <Card key={index} className={`relative p-8 ${plan.popular ? 'border-2 border-[#1a3d2b]' : ''}`}>
              {plan.popular && (
                <div className="absolute -top-3 left-1/2 transform -translate-x-1/2">
                  <span className="text-white px-4 py-1 text-sm font-medium rounded-full whitespace-nowrap" style={{ backgroundColor: '#1a3d2b' }}>
                    Most Popular
                  </span>
                </div>
              )}
              <div className="text-center mb-8">
                <h3 className="text-2xl font-bold text-black mb-2">{plan.name}</h3>
                <div className="flex items-baseline justify-center">
                  <span className="text-4xl font-bold text-black">{plan.price}</span>
                  <span className="text-gray-600 ml-1">{plan.period}</span>
                </div>
              </div>

              <ul className="space-y-4 mb-8">
                {plan.features.map((feature, featureIndex) => (
                  <li key={featureIndex} className="flex items-center">
                    <i className="ri-check-line text-green-500 mr-3"></i>
                    <span className="text-gray-700">{feature}</span>
                  </li>
                ))}
              </ul>

              <Button
                className={`w-full whitespace-nowrap ${
                  plan.popular
                    ? 'text-white'
                    : 'bg-gray-100 text-black hover:bg-gray-200'
                }`}
                style={plan.popular ? { backgroundColor: '#1a3d2b' } : undefined}
              >
                Choose plan
              </Button>
            </Card>
          ))}
        </div>
      </div>
    </section>
  );
}
