export default function PlatformsSection() {
  const platforms = [
    {
      name: 'Depop',
      logo: 'ri-shopping-bag-line',
      description: 'Trendy streetwear and vintage fashion marketplace',
      color: 'bg-red-500'
    },
    {
      name: 'Vinted',
      logo: 'ri-shirt-line',
      description: 'European fashion marketplace for pre-loved clothes',
      color: 'bg-green-500'
    },
    {
      name: 'eBay',
      logo: 'ri-auction-line',
      description: 'Global marketplace with extensive fashion categories',
      color: 'bg-yellow-500'
    },
    {
      name: 'Poshmark',
      logo: 'ri-handbag-line',
      description: 'Social commerce platform for fashion lovers',
      color: 'bg-pink-500'
    },
    {
      name: 'Mercari',
      logo: 'ri-store-line',
      description: 'Mobile marketplace for fashion and accessories',
      color: 'bg-orange-500'
    }
  ];

  return (
    <section className="py-20 bg-white">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-16">
          <h2 className="text-3xl lg:text-4xl font-bold text-gray-900 mb-4">
            Connected to All Major Platforms
          </h2>
          <p className="text-xl text-gray-600 max-w-3xl mx-auto">
            We monitor prices and trends across the most popular fashion resale platforms to give you comprehensive market insights.
          </p>
        </div>
        
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-6">
          {platforms.map((platform, index) => (
            <div key={index} className="text-center group hover:transform hover:scale-105 transition-all duration-200">
              <div className={`w-16 h-16 ${platform.color} rounded-2xl flex items-center justify-center mx-auto mb-4 group-hover:shadow-lg transition-shadow`}>
                <i className={`${platform.logo} text-2xl text-white`}></i>
              </div>
              <h3 className="font-semibold text-gray-900 mb-2">
                {platform.name}
              </h3>
              <p className="text-sm text-gray-600 leading-relaxed">
                {platform.description}
              </p>
            </div>
          ))}
        </div>
        
        <div className="mt-16 text-center">
          <div className="inline-flex items-center bg-brand-50 rounded-full px-6 py-3">
            <i className="ri-add-line text-brand-600 mr-2"></i>
            <span className="text-brand-600 font-medium">More platforms coming soon</span>
          </div>
        </div>
      </div>
    </section>
  );
}
