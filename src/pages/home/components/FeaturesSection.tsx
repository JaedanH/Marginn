import Card from '../../../components/base/Card';

export default function FeaturesSection() {
  const features = [
    {
      icon: 'ri-camera-ai-line',
      title: 'AI Image Recognition',
      description: 'Advanced AI technology identifies brands, styles, and specific clothing items from any photo with 95% accuracy.'
    },
    {
      icon: 'ri-line-chart-line',
      title: 'Real-Time Price Analysis',
      description: 'Get instant access to current market prices, historical trends, and demand levels across multiple platforms.'
    },
    {
      icon: 'ri-money-dollar-circle-line',
      title: 'Profit Calculator',
      description: 'Calculate potential profit margins, fees, and ROI to make informed buying and selling decisions.'
    },
    {
      icon: 'ri-global-line',
      title: 'Multi-Platform Search',
      description: 'Search across Depop, Vinted, eBay, and more to find the best prices and opportunities.'
    },
    {
      icon: 'ri-notification-3-line',
      title: 'Price Alerts',
      description: 'Set up alerts for specific items and get notified when prices drop or demand increases.'
    },
    {
      icon: 'ri-bar-chart-box-line',
      title: 'Market Insights',
      description: 'Access detailed analytics on brand performance, seasonal trends, and market predictions.'
    }
  ];

  return (
    <section className="py-20 bg-gray-100">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-16">
          <h2 className="text-3xl lg:text-4xl font-bold text-gray-900 mb-4">
            Everything You Need for Fashion Resale Success
          </h2>
          <p className="text-xl text-gray-600 max-w-3xl mx-auto">
            Our comprehensive analytics platform gives you the insights and tools to maximize your fashion resale profits.
          </p>
        </div>
        
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
          {features.map((feature, index) => (
            <Card key={index} className="text-center hover:shadow-lg transition-shadow">
              <div className="w-16 h-16 bg-brand-100 rounded-full flex items-center justify-center mx-auto mb-6">
                <i className={`${feature.icon} text-2xl text-brand-600`}></i>
              </div>
              <h3 className="text-xl font-semibold text-gray-900 mb-4">
                {feature.title}
              </h3>
              <p className="text-gray-600 leading-relaxed">
                {feature.description}
              </p>
            </Card>
          ))}
        </div>
      </div>
    </section>
  );
}
