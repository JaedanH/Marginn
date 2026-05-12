
export default function HowItWorksSection() {
  const steps = [
    {
      icon: 'ri-camera-line',
      title: 'Upload a photo',
      description: 'Take or upload a photo of any clothing item you want to analyze'
    },
    {
      icon: 'ri-search-eye-line',
      title: 'We identify the product',
      description: 'Our AI recognizes the brand, style, and key details of your item'
    },
    {
      icon: 'ri-line-chart-line',
      title: 'We show resale and retail prices',
      description: 'Get instant pricing data from Vinted, Depop, and other marketplaces'
    }
  ];

  return (
    <section className="py-24 bg-gray-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-16">
          <h2 className="text-4xl font-bold text-black mb-4">
            How it works
          </h2>
          <p className="text-xl text-gray-600 max-w-2xl mx-auto">
            Get instant resale insights in three simple steps
          </p>
        </div>
        
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          {steps.map((step, index) => (
            <div key={index} className="text-center">
              <div className="w-16 h-16 text-white rounded-full flex items-center justify-center mx-auto mb-6" style={{ backgroundColor: '#1a3d2b' }}>
                <i className={`${step.icon} text-2xl`}></i>
              </div>
              <h3 className="text-xl font-semibold text-black mb-3">
                {step.title}
              </h3>
              <p className="text-gray-600 leading-relaxed">
                {step.description}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
